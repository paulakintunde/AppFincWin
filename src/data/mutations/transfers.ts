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
import { buildTransferLegs } from '@/engine/transfer';
import { buildStep, inverseOfInserts } from '@/engine/undo';
import { insertTransactionsBatch } from '@/db/transactions';
import type { CustomCurrencyRow, FxLatestRow, NewTransaction, TransactionRow } from '@/db/rows';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { provisionalStamp } from './provisional';
import { followUpIfRatePending, invalidateDerivedReads, patchMonthCacheIfLoaded } from './transactionCache';
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

export function registerTransferMutations(qc: QueryClient): void {
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

