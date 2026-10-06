// REC-18 / D-50 / D-51: transfer mutations. A transfer is two linked `transactions` rows
// (one out, one in) sharing one transfer_id. Creating, editing and deleting one is a single
// atomic write covering both legs and a single undo step, queued like any other write
// (D-29). The legs are never derived from each other: each keeps its own currency and its
// own FX stamp through the Phase 1 path (D-50), so nothing in this module converts an amount.
//
// Defaults are registered here and hooked in from registerTransactionMutations (one line) so
// the paused-mutation restore after an app restart finds real code to resume with.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { localDateIn, monthOf } from '@/engine/time';
import { buildTransferLegs, transferEditPatches, type TransferPairState } from '@/engine/transfer';
import { buildStep, inverseOfInserts, NOW_SENTINEL, planBulkPatch, type PatchValue, type UndoConflict } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { applyPatches, type AppliedRow } from '@/db/patches';
import { fetchTransferLegs, insertTransactionsBatch } from '@/db/transactions';
import type { CustomCurrencyRow, FxLatestRow, NewTransaction, TransactionRow } from '@/db/rows';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { editStamp, provisionalStamp } from './provisional';
import { followUpIfRatePending, invalidateDerivedReads, patchMonthCacheIfLoaded, placeRowInMonth } from './transactionCache';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type TransactionList = WithPending<TransactionRow>[];
type InsertedLeg = Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>;

export interface AddTransferInput {
  householdId: string;
  ownerId: string;
  from: { id: string; currency: string };
  to: { id: string; currency: string };
  amountOut: number;
  amountIn: number;
  localDate?: string;
  timeZone?: string;
  /** The user's system Transfer category (D-56). Required: null throws before anything is queued. */
  transferCategoryId: string | null;
  note?: string | null;
  /** Name for the undo label (the destination account's name). */
  toName: string;
  homeCurrency: string;
}

export interface AddTransferVars {
  householdId: string;
  ownerId: string;
  stepId: string;
  rows: [NewTransaction, NewTransaction];
  transferId: string;
  labelName: string;
  homeCurrency: string;
}

/** The failed-writes entity id for a whole transfer: ids only, never amounts or names. */
function transferEntityId(transferId: string): string {
  return `transfer:${transferId}`;
}

function optimisticLeg(
  tx: NewTransaction,
  vars: AddTransferVars,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  now: string
): WithPending<TransactionRow> {
  const stamp = provisionalStamp(
    { amount: tx.original_amount, currency: tx.original_currency, homeCurrency: vars.homeCurrency, localDate: tx.local_date },
    rates,
    customs
  );
  return {
    id: tx.id,
    household_id: vars.householdId,
    account_id: tx.account_id,
    created_by: vars.ownerId,
    original_amount: tx.original_amount,
    original_currency: tx.original_currency,
    home_currency: vars.homeCurrency,
    home_amount: stamp.home_amount,
    rate: stamp.rate,
    orig_per_eur: stamp.orig_per_eur,
    home_per_eur: stamp.home_per_eur,
    orig_custom_unit_value: null,
    orig_custom_ref_per_eur: null,
    home_custom_unit_value: null,
    home_custom_ref_per_eur: null,
    rate_date: stamp.rate_date,
    rate_source: stamp.rate_source,
    rate_pending: stamp.rate_pending,
    local_date: tx.local_date,
    time_zone: tx.time_zone,
    note: tx.note,
    name: null,
    category_id: tx.category_id ?? null,
    payment_type: null,
    status: 'paid',
    deleted_at: null,
    import_batch_id: null,
    recurring_series_id: null,
    occurrence_date: null,
    updated_by: null,
    raw_amount: null,
    raw_balance: null,
    external_id: null,
    import_format: null,
    transfer_id: tx.transfer_id ?? null,
    version: 1,
    created_at: now,
    updated_at: now,
    pending: true,
  };
}

/** One leg as the edit/delete hooks receive it (D-51: either leg may be the one in hand). */
export interface TransferLegRow {
  id: string;
  household_id: string;
  account_id: string;
  original_amount: number;
  original_currency: string;
  local_date: string;
  version: number;
  transfer_id: string;
}

/** One leg's share of an edit: only the changed keys, with the values they replace. */
interface LegEdit {
  id: string;
  version: number;
  /** The month the leg is cached under now (before the edit moves it). */
  month: string;
  patch: Record<string, PatchValue>;
  before: Record<string, PatchValue>;
}

export interface EditTransferVars {
  householdId: string;
  ownerId: string;
  stepId: string;
  transferId: string;
  labelName: string;
  legs: LegEdit[];
}

export interface DeleteTransferVars {
  householdId: string;
  ownerId: string;
  stepId: string;
  transferId: string;
  labelName: string;
  /** The leg the user acted on: its version is the conflict check; the partner is fetched at flush. */
  leg: { id: string; version: number; month: string };
}

const LEG_KEYS = ['local_date', 'account_id', 'original_currency', 'original_amount'] as const;

/** D-26: a refusal that names who changed what is shown as the refusal toast. */
function showRefusalIfNamed(err: VersionConflictError): void {
  const row = err.serverRow;
  if (row !== null && typeof row === 'object' && 'reason' in row && 'entity' in row) {
    showToast({ kind: 'refusal', refusal: row as UndoConflict });
  }
}

/** Every loaded month list, so a leg can be found or removed without knowing its month. */
function loadedMonthKeys(qc: QueryClient, householdId: string): (readonly unknown[])[] {
  return qc
    .getQueriesData<TransactionList>({ queryKey: queryKeys.transactionsRoot(householdId) })
    .map(([key]) => key)
    .filter((key) => typeof key[2] === 'string' && /^\d{4}-\d{2}$/.test(key[2]));
}

function registerEditTransfer(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.editTransfer, {
    mutationFn: (vars: EditTransferVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // CR-A02: an earlier queued write of this same leg may already have bumped its version.
        const legs = vars.legs.map((leg) => ({ ...leg, expected: resolveExpectedVersion('transactions', leg.id, leg.version) }));
        const { forward, inverse } = planBulkPatch(
          legs.map((leg) => ({
            entity: 'transactions' as const,
            id: leg.id,
            expectedVersion: leg.expected,
            before: leg.before,
            patch: leg.patch,
          }))
        );
        // p_undo_step rides with the ops: the forward write and its inverse commit together,
        // and a replay keyed on the step id resolves as already-applied (D-WR-03).
        const step = buildStep(vars.stepId, 'transferEdited', { name: vars.labelName }, inverse);
        const applied = await applyPatches(client, forward, step);
        for (const leg of legs) {
          const row = applied.find((r) => r.id === leg.id);
          if (row) recordWrittenVersion('transactions', leg.id, [leg.version, leg.expected], row.version);
        }
        return applied;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditTransferVars) => {
      markSession(vars);
      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.ownerId)) ?? [];
      for (const leg of vars.legs) {
        const monthKey = queryKeys.transactionsMonth(vars.householdId, leg.month);
        await qc.cancelQueries({ queryKey: monthKey });
        const current = qc.getQueryData<TransactionList>(monthKey)?.find((r) => r.id === leg.id);
        if (!current) continue;
        const stamp = editStamp(current, leg.patch as { original_amount?: number; original_currency?: string; local_date?: string }, rates, customs);
        const patched = { ...current, ...leg.patch, ...stamp, pending: true } as WithPending<TransactionRow>;
        placeRowInMonth(qc, vars.householdId, patched, [leg.month]);
      }
    },
    onSuccess: (_rows: AppliedRow[], vars: EditTransferVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) }); // not awaited (WR-A15)
      invalidateDerivedReads(qc, vars.householdId);
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onError: (err: unknown, vars: EditTransferVars) => settleTransferFailure(qc, err, vars, 'edit'),
  });
}

/** Shared onError for edit and delete: refetch the truth, record ids only, tell the user on a refusal. */
async function settleTransferFailure(
  qc: QueryClient,
  err: unknown,
  vars: { householdId: string; transferId: string },
  action: 'edit' | 'delete'
): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
  if (cls === 'conflict' && err instanceof VersionConflictError) showRefusalIfNamed(err);
  invalidateDerivedReads(qc, vars.householdId);
  await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  await recordFailedWrite({
    entity: 'transactions',
    entityId: transferEntityId(vars.transferId),
    kind: cls,
    code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
    attempted: { transfer_id: vars.transferId, action },
  });
}

function registerDeleteTransfer(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.deleteTransfer, {
    mutationFn: (vars: DeleteTransferVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // D-51: only one leg may be in hand, so the pair is read at flush.
        const fetched = await fetchTransferLegs(client, vars.householdId, [vars.transferId]);
        const pair = fetched.filter((r) => r.transfer_id === vars.transferId);
        // A pair that is not exactly two live rows (the other leg already deleted, or this one)
        // changed elsewhere: refuse rather than half-delete.
        if (pair.length !== 2 || !pair.some((r) => r.id === vars.leg.id)) {
          throw new VersionConflictError('transactions', vars.leg.id, null);
        }
        const items = pair.map((row) => {
          const base = row.id === vars.leg.id ? vars.leg.version : row.version;
          return {
            id: row.id,
            base,
            expected: resolveExpectedVersion('transactions', row.id, base),
          };
        });
        const { forward, inverse } = planBulkPatch(
          items.map((item) => ({
            entity: 'transactions' as const,
            id: item.id,
            expectedVersion: item.expected,
            before: { deleted_at: null },
            patch: { deleted_at: NOW_SENTINEL },
          }))
        );
        const step = buildStep(vars.stepId, 'transferDeleted', { name: vars.labelName }, inverse);
        const applied = await applyPatches(client, forward, step);
        for (const item of items) {
          const row = applied.find((r) => r.id === item.id);
          if (row) recordWrittenVersion('transactions', item.id, [item.base, item.expected], row.version);
        }
        return applied;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: DeleteTransferVars) => {
      markSession(vars);
      // Both legs leave every loaded month at once, though only one is in hand.
      for (const key of loadedMonthKeys(qc, vars.householdId)) {
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<TransactionList>(key, (rows) =>
          rows?.filter((r) => r.transfer_id !== vars.transferId && r.id !== vars.leg.id)
        );
      }
    },
    onSuccess: (_rows: AppliedRow[], vars: DeleteTransferVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onError: (err: unknown, vars: DeleteTransferVars) => settleTransferFailure(qc, err, vars, 'delete'),
  });
}

export function registerTransferMutations(qc: QueryClient): void {
  registerEditTransfer(qc);
  registerDeleteTransfer(qc);
  qc.setMutationDefaults(mutationKeys.addTransfer, {
    // D-50: both legs in ONE upsert statement so the deferred pair check sees two rows at
    // commit. The undo step is recorded after, from the versions the server returned.
    mutationFn: (vars: AddTransferVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const rows = await insertTransactionsBatch(client, vars.rows);
        // A replay of an insert that already landed returns no rows (ignoreDuplicates): there
        // is no honest version to build the inverse from, so none is recorded -- the original
        // attempt's own step stands.
        if (rows.length === vars.rows.length) {
          const step = buildStep(
            vars.stepId,
            'transferAdded',
            { name: vars.labelName },
            inverseOfInserts('transactions', rows.map((r) => ({ id: r.id, version: r.version })))
          );
          await recordUndoStepSafely(qc, client, step, vars.ownerId);
        }
        return rows;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddTransferVars) => {
      markSession(vars);
      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.ownerId)) ?? [];
      const now = new Date().toISOString();
      for (const tx of vars.rows) {
        const month = monthOf(tx.local_date);
        await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, month) });
        const row = optimisticLeg(tx, vars, rates, customs, now);
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (list: TransactionList) => upsertRow(list, row, 'start'));
      }
    },
    onSuccess: (rows: InsertedLeg[], vars: AddTransferVars) => {
      // The insert returns ids and versions only, not full rows: refetch what is loaded.
      // Not awaited (WR-A15): query-core holds WRITE_SCOPE while this handler runs.
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
      for (const row of rows) {
        void followUpIfRatePending(qc, vars.householdId, monthOf(row.local_date), row); // per leg
      }
    },
    onError: async (err: unknown, vars: AddTransferVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const ids = new Set(vars.rows.map((r) => r.id));
      for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (list) => list.filter((r) => !ids.has(r.id)));
      }
      invalidateDerivedReads(qc, vars.householdId);
      await recordFailedWrite({
        entity: 'transactions',
        entityId: transferEntityId(vars.transferId),
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { transfer_id: vars.transferId },
      });
    },
  });
}

export function useAddTransfer(): { add(input: AddTransferInput): { transferId: string; stepId: string } } {
  const mutation = useMutation<InsertedLeg[], unknown, AddTransferVars>({
    mutationKey: mutationKeys.addTransfer,
    scope: WRITE_SCOPE,
  });

  return {
    add(input: AddTransferInput): { transferId: string; stepId: string } {
      if (!input.transferCategoryId) {
        throw new TypeError('useAddTransfer: transferCategoryId is required (the system Transfer category)');
      }
      const timeZone = input.timeZone ?? getDeviceTimeZone();
      const localDate = input.localDate ?? localDateIn(new Date(), timeZone);
      const transferId = Crypto.randomUUID();
      const built = buildTransferLegs({
        transferId,
        outId: Crypto.randomUUID(),
        inId: Crypto.randomUUID(),
        from: input.from,
        to: input.to,
        amountOut: input.amountOut as never,
        amountIn: input.amountIn as never,
        localDate,
      });
      if (!built.ok) {
        throw new TypeError(`useAddTransfer: invalid transfer (${built.error})`);
      }

      const toRow = (leg: (typeof built.legs)[number]): NewTransaction => ({
        id: leg.id,
        household_id: input.householdId,
        account_id: leg.accountId,
        original_amount: leg.amount,
        original_currency: leg.currency,
        local_date: leg.localDate,
        time_zone: timeZone,
        note: input.note ?? null,
        name: null,
        category_id: input.transferCategoryId,
        payment_type: null,
        status: 'paid',
        transfer_id: leg.transferId,
      });

      const stepId = newStepId();
      mutation.mutate({
        householdId: input.householdId,
        ownerId: input.ownerId,
        stepId,
        rows: [toRow(built.legs[0]), toRow(built.legs[1])],
        transferId,
        labelName: input.toName,
        homeCurrency: input.homeCurrency,
      });
      return { transferId, stepId };
    },
  };
}

export interface TransferEditContext {
  ownerId: string;
  /** Name for the undo label (the destination account's name). */
  labelName: string;
}

/**
 * Both legs must be the same one pair: a leg with no transfer_id, or two legs with different
 * ones, is never edited or linked into anything (review follow-up: a leg that already has a
 * transfer_id must never join a second transfer).
 */
function assertOnePair(out: TransferLegRow, inn: TransferLegRow): string {
  if (!out.transfer_id || out.transfer_id !== inn.transfer_id) {
    throw new TypeError('useEditTransfer: the two legs are not one linked transfer');
  }
  return out.transfer_id;
}

function legState(leg: TransferLegRow): TransferPairState['out'] {
  return { accountId: leg.account_id, currency: leg.original_currency, amount: leg.original_amount, localDate: leg.local_date };
}

export function useEditTransfer(): {
  /** Returns the undo step id, or null when nothing changed (no write is queued). */
  edit(legs: { out: TransferLegRow; in: TransferLegRow }, after: TransferPairState, ctx: TransferEditContext): string | null;
} {
  const mutation = useMutation<AppliedRow[], unknown, EditTransferVars>({
    mutationKey: mutationKeys.editTransfer,
    scope: WRITE_SCOPE,
  });

  return {
    edit(legs, after, ctx): string | null {
      const transferId = assertOnePair(legs.out, legs.in);
      const result = transferEditPatches({ out: legState(legs.out), in: legState(legs.in) }, after);
      if (!result.ok) throw new TypeError(`useEditTransfer: invalid edit (${result.error})`);

      const edits: LegEdit[] = [];
      for (const [leg, patch] of [[legs.out, result.patches.out], [legs.in, result.patches.in]] as const) {
        const keys = Object.keys(patch);
        if (keys.length === 0) continue;
        const before: Record<string, PatchValue> = {};
        for (const key of keys) {
          if (!(LEG_KEYS as readonly string[]).includes(key)) throw new TypeError(`useEditTransfer: unexpected patch key ${key}`);
          before[key] = leg[key as (typeof LEG_KEYS)[number]];
        }
        edits.push({ id: leg.id, version: leg.version, month: monthOf(leg.local_date), patch: { ...patch }, before });
      }
      if (edits.length === 0) return null;

      const stepId = newStepId();
      mutation.mutate({
        householdId: legs.out.household_id,
        ownerId: ctx.ownerId,
        stepId,
        transferId,
        labelName: ctx.labelName,
        legs: edits,
      });
      return stepId;
    },
  };
}

export function useDeleteTransfer(): {
  /** Returns the undo step id. Either leg may be passed; the partner is fetched when the write flushes. */
  remove(leg: TransferLegRow, ctx: TransferEditContext): string;
} {
  const mutation = useMutation<AppliedRow[], unknown, DeleteTransferVars>({
    mutationKey: mutationKeys.deleteTransfer,
    scope: WRITE_SCOPE,
  });

  return {
    remove(leg, ctx): string {
      if (!leg.transfer_id) throw new TypeError('useDeleteTransfer: the row is not a transfer leg');
      const stepId = newStepId();
      mutation.mutate({
        householdId: leg.household_id,
        ownerId: ctx.ownerId,
        stepId,
        transferId: leg.transfer_id,
        labelName: ctx.labelName,
        leg: { id: leg.id, version: leg.version, month: monthOf(leg.local_date) },
      });
      return stepId;
    },
  };
}

