// 05.2-15 (DSU-05, DSU-06, DSU-21; owner OQ5, research Pitfall 8): the write paths for regular payments.
//   confirmRegularCandidate: create the series through its RPC (linking the logged rows it was found from), then set its
//     attributes (counts_as, income_kind, pay_group, saving_mode) with apply_patches, as ONE user action. The create RPC is called WITHOUT a server-side
//     undo step; one client step labelled paymentMarkedRegular is recorded after both writes land, so a single Undo
//     removes the series (and its materialised lines) and puts back a cleared "not regular" answer.
//   patchSeriesAttributes: attribute changes on existing series, one apply_patches batch carrying its own undo step.
// Replay: the create is idempotent (an 'already-applied' answer reads the live version and the series' live lines back,
// so the Undo step still removes the lines and unlinks the logged rows) and the patch is made
// at the version read back, so a crash between the two writes is repaired by the replay. Variables are plain JSON;
// the step id is minted once before mutate() and is the replay key. Failed-write records hold ids, counts and field
// names only, never a name or an amount.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  buildStep,
  inverseOfPatches,
  inverseOfSeriesChange,
  planBulkPatch,
  NOW_SENTINEL,
  type BulkPatchItem,
  type PatchOp,
  type PatchValue,
  type SeriesChangeSet,
  type UndoConflict,
  type UndoLabelKey,
} from '@/engine/undo';
import { DbError, NotFoundError, VersionConflictError, toDbError, type WriteEntity } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import { createRecurringSeries, type NewRecurringSeries } from '@/db/recurringSeries';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import type { DbClient, RecurringSeriesRow } from '@/db/rows';
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
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

export interface SeriesAttributes {
  counts_as?: 'available' | 'kept' | null;
  income_kind?: string | null;
  saving_mode?: 'fixed' | 'flexible' | null;
  pay_group?: string | null;
}

const ATTRIBUTE_KEYS = ['counts_as', 'income_kind', 'saving_mode', 'pay_group'] as const satisfies readonly (keyof SeriesAttributes)[];

type SeriesList = WithPending<RecurringSeriesRow>[];
type DismissalList = RecurringDismissalRow[];

export interface ConfirmRegularVars {
  ownerId: string;
  householdId: string;
  stepId: string;
  series: NewRecurringSeries;
  attributes: Record<string, PatchValue>;
  /** The live "not regular" answer this confirm replaces, if any. */
  dismissal: { id: string; version: number } | null;
  /** Absent on variables persisted by an older build: no sign check. */
  direction?: 'in' | 'out';
  /** Logged rows the series is found from. Absent on older persisted variables: none. */
  linkTransactionIds?: string[];
}

export interface PatchSeriesVars {
  ownerId: string;
  householdId: string;
  stepId: string;
  labelKey: UndoLabelKey;
  labelName: string | null;
  items: BulkPatchItem[];
}

/** The keys of `attributes` that are set (not undefined), as a plain patch. */
function attributePatch(attributes: SeriesAttributes): Record<string, PatchValue> {
  const out: Record<string, PatchValue> = {};
  for (const k of ATTRIBUTE_KEYS) {
    const v = attributes[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function liveVersion(client: DbClient, id: string): Promise<number> {
  const { data, error, status } = await client.from('recurring_series').select('id, version').eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  if (!data) throw new NotFoundError('recurring_series', id);
  return (data as { version: number }).version;
}

/** The live (not deleted) transaction rows attached to a series, at their live versions. */
async function liveSeriesRows(client: DbClient, seriesId: string): Promise<{ id: string; version: number }[]> {
  const { data, error, status } = await client
    .from('transactions')
    .select('id, version')
    .eq('recurring_series_id', seriesId)
    .is('deleted_at', null);
  if (error) throw toDbError(error, status);
  return ((data ?? []) as { id: string; version: number }[]).map((r) => ({ id: r.id, version: r.version }));
}

async function runConfirm(qc: QueryClient, vars: ConfirmRegularVars): Promise<{ seriesId: string }> {
  const client = await writeClient();
  if (vars.direction) {
    const sign = Math.sign(vars.series.amount);
    if (sign !== (vars.direction === 'out' ? -1 : 1)) throw new DbError('series sign does not match direction', '23514', null);
  }
  const linkTransactionIds = vars.linkTransactionIds ?? [];
  const created = await createRecurringSeries(client, vars.series, { anchorTransactionId: null, linkTransactionIds });
  const createdSet: SeriesChangeSet | null = created.status === 'applied' ? created.changeSet : null;
  // A replay ('already-applied') carries no change set: read the live version back, and the lines below.
  const base = createdSet ? createdSet.series.versionAfter : await liveVersion(client, vars.series.id);
  const replayRows = createdSet ? [] : await liveSeriesRows(client, vars.series.id);

  const ops: PatchOp[] = [];
  if (Object.keys(vars.attributes).length > 0) {
    ops.push({
      entity: 'recurring_series',
      id: vars.series.id,
      expectedVersion: resolveExpectedVersion('recurring_series', vars.series.id, base),
      patch: vars.attributes,
    });
  }
  if (vars.dismissal) {
    ops.push({
      entity: 'recurring_dismissals',
      id: vars.dismissal.id,
      expectedVersion: resolveExpectedVersion('recurring_dismissals', vars.dismissal.id, vars.dismissal.version),
      patch: { deleted_at: NOW_SENTINEL },
    });
  }

  let seriesVersion = base;
  let dismissalVersion = vars.dismissal ? vars.dismissal.version + 1 : 0;
  if (ops.length > 0) {
    const rows = await applyPatches(client, ops);
    for (const row of rows) {
      recordWrittenVersion(row.entity as WriteEntity, row.id, [], row.version);
      if (row.entity === 'recurring_series' && row.id === vars.series.id) seriesVersion = row.version;
      if (row.entity === 'recurring_dismissals' && vars.dismissal && row.id === vars.dismissal.id) dismissalVersion = row.version;
    }
  }

  const change: SeriesChangeSet = createdSet
    ? { ...createdSet, series: { ...createdSet.series, versionAfter: seriesVersion } }
    : {
        series: { id: vars.series.id, versionAfter: seriesVersion, before: null },
        inserted: replayRows.filter((r) => !linkTransactionIds.includes(r.id)),
        softDeleted: [],
        linked: replayRows.filter((r) => linkTransactionIds.includes(r.id)).map((r) => ({ id: r.id, versionAfter: r.version })),
      };
  const inverse: PatchOp[] = [...inverseOfSeriesChange(change)];
  if (vars.dismissal) {
    inverse.push(
      ...inverseOfPatches('recurring_dismissals', [{ id: vars.dismissal.id, before: { deleted_at: null }, versionAfter: dismissalVersion }])
    );
  }
  const step = buildStep(vars.stepId, 'paymentMarkedRegular', { name: vars.series.name }, inverse);
  await recordUndoStepSafely(qc, client, step, vars.ownerId);
  return { seriesId: vars.series.id };
}

async function runPatch(vars: PatchSeriesVars) {
  const client = await writeClient();
  const resolved = vars.items.map((i) => ({
    ...i,
    expectedVersion: resolveExpectedVersion(i.entity as WriteEntity, i.id, i.expectedVersion),
  }));
  const { forward, inverse } = planBulkPatch(resolved);
  const step = buildStep(vars.stepId, vars.labelKey, vars.labelName ? { name: vars.labelName } : {}, inverse);
  const rows = await applyPatches(client, forward, step);
  const bases = new Map(vars.items.map((i, k) => [i.id, [i.expectedVersion, resolved[k]!.expectedVersion]] as const));
  for (const row of rows) recordWrittenVersion(row.entity as WriteEntity, row.id, bases.get(row.id) ?? [], row.version);
  return rows;
}

function patchSeriesCache(qc: QueryClient, householdId: string, updater: (rows: SeriesList) => SeriesList): void {
  qc.setQueryData<SeriesList>(queryKeys.recurringSeries(householdId), (old) => updater(old ?? []));
}

function invalidateSeries(qc: QueryClient, householdId: string, ownerId: string, withLines: boolean): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(householdId) });
  if (withLines) void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(ownerId) });
}

export function registerSeriesAttributeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.confirmRegularCandidate, {
    mutationFn: (vars: ConfirmRegularVars) => guardSession(vars, () => runConfirm(qc, vars)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ConfirmRegularVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<RecurringSeriesRow> = {
        ...vars.series,
        is_automatic: vars.series.is_automatic ?? false,
        is_sample: false,
        created_by: null,
        updated_by: null,
        materialised_through: null,
        deleted_at: null,
        counts_as: null,
        income_kind: null,
        saving_mode: null,
        pay_group: null,
        ...vars.attributes,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchSeriesCache(qc, vars.householdId, (rows) => upsertRow(rows, optimistic, 'start'));
      if (vars.dismissal) {
        const id = vars.dismissal.id;
        qc.setQueryData<DismissalList>(queryKeys.recurringDismissals(vars.householdId), (old) => (old ?? []).filter((r) => r.id !== id));
      }
    },
    onSuccess: (_result: { seriesId: string }, vars: ConfirmRegularVars) => {
      invalidateSeries(qc, vars.householdId, vars.ownerId, true);
      if (vars.dismissal) void qc.invalidateQueries({ queryKey: queryKeys.recurringDismissals(vars.householdId) });
    },
    onError: async (err: unknown, vars: ConfirmRegularVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      patchSeriesCache(qc, vars.householdId, (rows) => rows.filter((r) => r.id !== vars.series.id));
      if (vars.dismissal) void qc.invalidateQueries({ queryKey: queryKeys.recurringDismissals(vars.householdId) });
      await recordFailedWrite({
        entity: 'recurring_series',
        entityId: vars.series.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { labelKey: 'paymentMarkedRegular', fields: Object.keys(vars.attributes) },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.patchSeriesAttributes, {
    mutationFn: (vars: PatchSeriesVars) => guardSession(vars, () => runPatch(vars)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: PatchSeriesVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      const byId = new Map(vars.items.map((i) => [i.id, i.patch] as const));
      patchSeriesCache(qc, vars.householdId, (rows) =>
        rows.map((r) => (byId.has(r.id) ? ({ ...r, ...byId.get(r.id), pending: true } as WithPending<RecurringSeriesRow>) : r))
      );
    },
    onSuccess: (_rows: unknown, vars: PatchSeriesVars) => {
      invalidateSeries(qc, vars.householdId, vars.ownerId, false);
    },
    onError: async (err: unknown, vars: PatchSeriesVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      const attempted = {
        labelKey: vars.labelKey,
        n: vars.items.length,
        fields: [...new Set(vars.items.flatMap((i) => Object.keys(i.patch)))],
      };
      if (err instanceof VersionConflictError) {
        invalidateSeries(qc, vars.householdId, vars.ownerId, false);
        const conflict = err.serverRow as UndoConflict;
        await recordFailedWrite({
          entity: conflict.entity,
          entityId: conflict.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        showToast({ kind: 'refusal', refusal: conflict });
        return;
      }
      const byId = new Map(vars.items.map((i) => [i.id, i.before] as const));
      patchSeriesCache(qc, vars.householdId, (rows) =>
        rows.map((r) => (byId.has(r.id) ? ({ ...r, ...byId.get(r.id) } as WithPending<RecurringSeriesRow>) : r))
      );
      invalidateSeries(qc, vars.householdId, vars.ownerId, false);
      await recordFailedWrite({
        entity: 'recurring_series',
        entityId: `bulk:${vars.stepId}`,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted,
      });
    },
  });
}

/**
 * "Regular" on a found payment: the series and its attributes in one action, one Undo. `series` is the shape the
 * create RPC takes (client-generated id). Returns the series id and the undo step id.
 */
export function useConfirmRegularCandidate(
  householdId: string,
  ownerId: string
): {
  confirm(input: {
    series: NewRecurringSeries;
    /** The found payment's direction: it decides the stored sign (out = negative). */
    direction: 'in' | 'out';
    /** Every logged row the payment was found from. */
    linkTransactionIds: readonly string[];
    attributes: SeriesAttributes;
    dismissalToClear?: RecurringDismissalRow | null;
  }): { seriesId: string; stepId: string };
} {
  const mutation = useMutation<{ seriesId: string }, unknown, ConfirmRegularVars>({
    mutationKey: mutationKeys.confirmRegularCandidate,
    scope: WRITE_SCOPE,
  });
  return {
    confirm({ series, direction, linkTransactionIds, attributes, dismissalToClear }) {
      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        householdId,
        stepId,
        series: { ...series, amount: direction === 'out' ? -Math.abs(series.amount) : Math.abs(series.amount) },
        attributes: attributePatch(attributes),
        dismissal: dismissalToClear ? { id: dismissalToClear.id, version: dismissalToClear.version } : null,
        direction,
        linkTransactionIds: [...linkTransactionIds],
      });
      return { seriesId: series.id, stepId };
    },
  };
}

/** Attribute changes on existing series: only changed keys, one batch, one Undo. Nothing changed returns null. */
export function usePatchSeriesAttributes(
  householdId: string,
  ownerId: string
): {
  patch(
    items: readonly { series: RecurringSeriesRow; attributes: SeriesAttributes }[],
    labelKey?: UndoLabelKey,
    labelName?: string
  ): { stepId: string } | null;
} {
  const mutation = useMutation<unknown, unknown, PatchSeriesVars>({
    mutationKey: mutationKeys.patchSeriesAttributes,
    scope: WRITE_SCOPE,
  });
  return {
    patch(items, labelKey = 'setupStepSaved', labelName) {
      const seen = new Set<string>();
      const ops: BulkPatchItem[] = [];
      for (const { series, attributes } of items) {
        if (seen.has(series.id)) continue;
        seen.add(series.id);
        const patch: Record<string, PatchValue> = {};
        const before: Record<string, PatchValue> = {};
        for (const k of ATTRIBUTE_KEYS) {
          const next = attributes[k];
          if (next === undefined || next === (series[k] ?? null)) continue;
          patch[k] = next;
          before[k] = series[k] ?? null;
        }
        if (Object.keys(patch).length === 0) continue;
        ops.push({ entity: 'recurring_series', id: series.id, expectedVersion: series.version, before, patch });
      }
      if (ops.length === 0) return null;
      const stepId = newStepId();
      mutation.mutate({ ownerId, householdId, stepId, labelKey, labelName: labelName ?? null, items: ops });
      return { stepId };
    },
  };
}
