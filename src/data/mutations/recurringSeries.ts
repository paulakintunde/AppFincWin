// REC-05, REC-06: paused-mutation defaults and hooks for creating a recurring series
// (fresh, from an existing row, or from accepted import suggestions), editing it "this and
// future", and ending it, plus two pure helpers mapping transaction edits onto series fields.
//
// D-WR-04: the three series RPCs record their own undo step in the same transaction as the
// write, built server-side from their own change set. So nothing here calls insertUndoStep
// or inverseOfSeriesChange: the caller mints one step id up front (kept across paused-mutation
// replays -- it is the server's replay key) and the label rides on the RPC. A replayed call
// comes back 'already-applied' and records nothing twice (D-29).
//
// FX (02-46): the create/edit RPCs return only a change set, not the foreign lines the server
// materialised, so a foreign series follows up its rate_pending rows by reading them back
// (followUpSeriesRates). Lines the daily recurring-materialise job creates later are covered by
// the pending sweep (02-47); 02-50 records that dependency in docs/ops/fx-operations.md.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { RecurringFreq } from '@/engine/recurring';
import { localDateIn } from '@/engine/time';
import { fetchRatePendingRows } from '@/db/fxResolve';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { VersionConflictError } from '@/db/errors';
import {
  createRecurringSeries,
  editRecurringSeriesFrom,
  endRecurringSeries,
  type NewRecurringSeries,
  type RecurringSeriesPatch,
  type SeriesUndoLabel,
  type SeriesWriteResult,
} from '@/db/recurringSeries';
import type { MoneyPrefsRow, RecurringSeriesRow, TransactionPatch, TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { followUpPendingByDate, lazySupabaseClient } from './transactionCache';

export interface ScheduleInput {
  freq: RecurringFreq;
  endDate: string | null;
  occurrenceCount: number | null;
}

type SeriesList = WithPending<RecurringSeriesRow>[];

/** The series fields a transaction row supplies when it becomes the first occurrence (D-09). */
type SeriesSourceRow = Pick<
  TransactionRow,
  | 'household_id'
  | 'account_id'
  | 'original_amount'
  | 'original_currency'
  | 'category_id'
  | 'payment_type'
  | 'time_zone'
  | 'local_date'
  | 'name'
>;

export function seriesInputFromRow(row: SeriesSourceRow, schedule: ScheduleInput, id: string): NewRecurringSeries {
  if (row.name === null || row.name.length === 0) {
    throw new TypeError('A recurring series needs a name; the source row has none');
  }
  return {
    id,
    household_id: row.household_id,
    account_id: row.account_id,
    name: row.name,
    amount: row.original_amount,
    currency: row.original_currency,
    category_id: row.category_id,
    payment_type: row.payment_type,
    freq: schedule.freq,
    anchor_date: row.local_date,
    time_zone: row.time_zone,
    end_date: schedule.endDate,
    occurrence_count: schedule.occurrenceCount,
  };
}

/** D-07: only these transaction keys describe the template; everything else stays on the one row. */
export function seriesPatchFromOccurrenceEdit(patch: TransactionPatch): RecurringSeriesPatch {
  const out: RecurringSeriesPatch = {};
  if (patch.original_amount !== undefined) out.amount = patch.original_amount;
  if (patch.original_currency !== undefined) out.currency = patch.original_currency;
  if (patch.account_id !== undefined) out.account_id = patch.account_id;
  if (patch.category_id !== undefined) out.category_id = patch.category_id;
  if (patch.payment_type !== undefined) out.payment_type = patch.payment_type;
  if (patch.name !== undefined && patch.name !== null) out.name = patch.name;
  if (patch.local_date !== undefined) out.anchor_date = patch.local_date;
  return out;
}

export interface CreateSeriesVars {
  series: NewRecurringSeries;
  anchorTransactionId: string | null;
  linkTransactionIds: string[];
  /** The anchor row was created in the same user action: its undo also removes it. */
  anchorIsNew?: boolean;
  ownerId: string;
  undo: SeriesUndoLabel;
}

export interface EditSeriesFromVars {
  id: string;
  householdId: string;
  expectedVersion: number;
  patch: RecurringSeriesPatch;
  effectiveFrom: string;
  ownerId: string;
  undo: SeriesUndoLabel;
}

export interface EndSeriesVars {
  id: string;
  householdId: string;
  expectedVersion: number;
  endDate: string;
  ownerId: string;
  undo: SeriesUndoLabel;
}

function patchSeriesCache(qc: QueryClient, householdId: string, updater: (rows: SeriesList) => SeriesList): void {
  qc.setQueryData<SeriesList>(queryKeys.recurringSeries(householdId), (old) => updater(old ?? []));
}

async function invalidateSeriesAndTransactions(qc: QueryClient, householdId: string, ownerId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(householdId) }),
    qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) }),
    // The server recorded the step in the same transaction; refresh the History list.
    qc.invalidateQueries({ queryKey: queryKeys.undoLog(ownerId) }),
  ]);
}

/** Shared failure handling for edit-from and end: conflicts and rejections refetch and park the attempt (D-19). */
async function handleSeriesWriteError(
  qc: QueryClient,
  err: unknown,
  vars: { id: string; householdId: string; ownerId: string },
  attempted: Record<string, unknown>
): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls === 'conflict' && err instanceof VersionConflictError) {
    await invalidateSeriesAndTransactions(qc, vars.householdId, vars.ownerId);
    await recordFailedWrite({
      entity: 'recurring_series',
      entityId: vars.id,
      kind: 'conflict',
      code: 'version-conflict',
      attempted,
    });
    return;
  }
  if (cls === 'rejected' || cls === 'not-found') {
    await invalidateSeriesAndTransactions(qc, vars.householdId, vars.ownerId);
    await recordFailedWrite({
      entity: 'recurring_series',
      entityId: vars.id,
      kind: cls,
      code: settledWriteErrorCode(err),
      attempted,
    });
  }
}

const SERIES_FOLLOW_UP_LIMIT = 100;

/**
 * Reads back the series' rate_pending lines (up to device-local tomorrow, oldest first) and
 * resolves them one call per date. Never throws and is never awaited by onSuccess: the series
 * write has already succeeded, and a failure leaves the rows to the pending sweep (02-47).
 */
async function followUpSeriesRates(qc: QueryClient, seriesId: string): Promise<void> {
  try {
    const tomorrow = localDateIn(new Date(Date.now() + 24 * 60 * 60 * 1000), getDeviceTimeZone());
    const rows = await fetchRatePendingRows(lazySupabaseClient(), {
      onOrBefore: tomorrow,
      limit: SERIES_FOLLOW_UP_LIMIT,
      order: 'asc',
      recurringSeriesId: seriesId,
    });
    if (rows.length > 0) await followUpPendingByDate(qc, rows);
  } catch {
    // Best-effort: the rows stay rate_pending and the pending sweep retries them.
  }
}

function recordVersion(id: string, bases: readonly number[], result: SeriesWriteResult): void {
  if (result.status === 'applied') recordWrittenVersion('recurring_series', id, bases, result.changeSet.series.versionAfter);
}

export function registerSeriesMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.createSeries, {
    mutationFn: (vars: CreateSeriesVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        return createRecurringSeries(
          client,
          vars.series,
          {
            anchorTransactionId: vars.anchorTransactionId,
            linkTransactionIds: vars.linkTransactionIds,
            anchorIsNew: vars.anchorIsNew,
          },
          vars.undo
        );
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: CreateSeriesVars) => {
      markSession(vars);
      const key = queryKeys.recurringSeries(vars.series.household_id);
      await qc.cancelQueries({ queryKey: key });
      const now = new Date().toISOString();
      // D-02/D-03: the optimistic row is what projects 'Expected' lines until the server materialises real ones.
      const optimistic: WithPending<RecurringSeriesRow> = {
        ...vars.series,
        is_automatic: vars.series.is_automatic ?? false,
        is_sample: false,
        created_by: null,
        updated_by: null,
        materialised_through: null,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchSeriesCache(qc, vars.series.household_id, (rows) => upsertRow(rows, optimistic, 'start'));
    },
    onSuccess: async (_result: SeriesWriteResult, vars: CreateSeriesVars) => {
      await invalidateSeriesAndTransactions(qc, vars.series.household_id, vars.ownerId);
      // A series in the home currency never has rate_pending lines, so skip the read. Unknown
      // prefs (not cached) fall through to the read, which returns [] for a home-only series.
      const home = qc.getQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs(vars.ownerId))?.home_currency;
      if (home === undefined || home !== vars.series.currency) void followUpSeriesRates(qc, vars.series.id);
    },
    onError: async (err: unknown, vars: CreateSeriesVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      patchSeriesCache(qc, vars.series.household_id, (rows) => rows.filter((r) => r.id !== vars.series.id));
      await recordFailedWrite({
        entity: 'recurring_series',
        entityId: vars.series.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        // Deliberately no amount: the failed-writes list never carries a money value for a series.
        attempted: { name: vars.series.name, freq: vars.series.freq, anchor_date: vars.series.anchor_date },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editSeriesFrom, {
    mutationFn: (vars: EditSeriesFromVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('recurring_series', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const result = await editRecurringSeriesFrom(client, vars.id, expected, vars.patch, vars.effectiveFrom, vars.undo);
        recordVersion(vars.id, [vars.expectedVersion, expected], result);
        return result;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditSeriesFromVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
    },
    onSuccess: async (_result: SeriesWriteResult, vars: EditSeriesFromVars) => {
      await invalidateSeriesAndTransactions(qc, vars.householdId, vars.ownerId);
      // An edit may re-materialise future lines (the patch need not carry a currency): always read back.
      void followUpSeriesRates(qc, vars.id);
    },
    onError: (err: unknown, vars: EditSeriesFromVars) => handleSeriesWriteError(qc, err, vars, { ...vars.patch }),
  });

  qc.setMutationDefaults(mutationKeys.endSeries, {
    mutationFn: (vars: EndSeriesVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('recurring_series', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const result = await endRecurringSeries(client, vars.id, expected, vars.endDate, vars.undo);
        recordVersion(vars.id, [vars.expectedVersion, expected], result);
        return result;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EndSeriesVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
    },
    onSuccess: async (_result: SeriesWriteResult, vars: EndSeriesVars) => {
      // D-08: paid history is never touched client-side; the refetch shows what the server did.
      await invalidateSeriesAndTransactions(qc, vars.householdId, vars.ownerId);
    },
    onError: (err: unknown, vars: EndSeriesVars) => handleSeriesWriteError(qc, err, vars, { endDate: vars.endDate }),
  });
}

export function useCreateSeries(): {
  /** Returns the undo step id, minted once here so a paused-mutation replay reuses it. */
  create(input: {
    series: NewRecurringSeries;
    anchorTransactionId?: string | null;
    linkTransactionIds?: string[];
    /** Pass true when the anchor entry was created in this same action (Repeats on a new entry). */
    anchorIsNew?: boolean;
    ownerId: string;
  }): string;
} {
  const mutation = useMutation<SeriesWriteResult, unknown, CreateSeriesVars>({
    mutationKey: mutationKeys.createSeries,
    scope: WRITE_SCOPE,
  });

  return {
    create(input): string {
      const stepId = Crypto.randomUUID();
      mutation.mutate({
        series: input.series,
        anchorTransactionId: input.anchorTransactionId ?? null,
        linkTransactionIds: input.linkTransactionIds ?? [],
        anchorIsNew: input.anchorIsNew ?? false,
        ownerId: input.ownerId,
        undo: { id: stepId, labelKey: 'seriesCreated', labelParams: { name: input.series.name } },
      });
      return stepId;
    },
  };
}

export function useEditSeriesFrom(): {
  editFrom(input: Omit<EditSeriesFromVars, 'undo'> & { name: string }): string;
} {
  const mutation = useMutation<SeriesWriteResult, unknown, EditSeriesFromVars>({
    mutationKey: mutationKeys.editSeriesFrom,
    scope: WRITE_SCOPE,
  });

  return {
    editFrom({ name, ...vars }): string {
      const stepId = Crypto.randomUUID();
      mutation.mutate({ ...vars, undo: { id: stepId, labelKey: 'seriesEdited', labelParams: { name } } });
      return stepId;
    },
  };
}

export function useEndSeries(): {
  end(input: Omit<EndSeriesVars, 'undo'> & { name: string }): string;
} {
  const mutation = useMutation<SeriesWriteResult, unknown, EndSeriesVars>({
    mutationKey: mutationKeys.endSeries,
    scope: WRITE_SCOPE,
  });

  return {
    end({ name, ...vars }): string {
      const stepId = Crypto.randomUUID();
      mutation.mutate({ ...vars, undo: { id: stepId, labelKey: 'seriesEnded', labelParams: { name } } });
      return stepId;
    },
  };
}
