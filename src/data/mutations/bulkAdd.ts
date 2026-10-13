// 02.3-13 (REC-30, D-14, D-15, D-28): the entry-sheet list save. Every listed entry (and the
// current entry when valid) becomes rows inserted in ONE request, then record_entry_list records
// ONE undo step labelled `addedMany` and creates the series of any repeating item, so a single
// Undo removes rows, series and occurrences together.
//
// Replay safety (T-02.3-13-03): rows carry client-minted UUIDs and the insert is ON CONFLICT DO
// NOTHING; the step id is minted once, before mutate(), and is the server's replay key (a replay
// of the RPC comes back 'already-applied', which is success).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { repeatToSchedule, type ListItem } from '@/engine/entryList';
import { buildTransferLegs } from '@/engine/transfer';
import { monthOf } from '@/engine/time';
import { ENTRY_LIST_MAX_ROWS, recordEntryList, type EntryListSeriesItem } from '@/db/entryList';
import { IMPORT_CHUNK_MAX, insertTransactionsBatch } from '@/db/transactions';
import { PAYMENT_TYPES, type NewTransaction, type PaymentType, type TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { showToast } from '@/state/undoToast';
import { maybeRequestSampleClearPrompt } from './samplePromptTrigger';
import { writeClient } from './writeClient';
import { optimisticTransactionRow } from './batchInsert';
import { seriesInputFromRow } from './recurringSeries';
import { newStepId } from './undoCapture';
import {
  followUpPendingByDate,
  invalidateDerivedReads,
  patchMonthCacheIfLoaded,
  placeRowInMonth,
} from './transactionCache';

export interface BulkAddContext {
  householdId: string;
  ownerId: string;
  homeCurrency: string;
  timeZone: string;
  transferCategoryId: string | null;
}

export interface EntryListWrite {
  rows: NewTransaction[];
  series: EntryListSeriesItem[];
}

/** One request, so a transfer pair never splits across chunks; also the RPC's own row cap. */
const MAX_ROWS = Math.min(IMPORT_CHUNK_MAX, ENTRY_LIST_MAX_ROWS);

function allowedPaymentType(item: ListItem): PaymentType | null {
  const allowed: readonly string[] = PAYMENT_TYPES[item.type === 'in' ? 'in' : 'out'];
  return item.paymentType !== null && allowed.includes(item.paymentType) ? (item.paymentType as PaymentType) : null;
}

/** Pure: turns list items into exactly the rows and series a set of single saves would create. */
export function buildEntryListWrite(items: readonly ListItem[], ctx: BulkAddContext, mint: () => string): EntryListWrite {
  const rows: NewTransaction[] = [];
  const series: EntryListSeriesItem[] = [];

  for (const item of items) {
    if (item.type === 'transfer') {
      if (!ctx.transferCategoryId) {
        throw new TypeError('buildEntryListWrite: transferCategoryId is required for a transfer');
      }
      if (item.toAccountId === null || item.toCurrency === null) {
        throw new TypeError('buildEntryListWrite: a transfer needs a destination account');
      }
      const transferId = mint();
      const built = buildTransferLegs({
        transferId,
        outId: mint(),
        inId: mint(),
        from: { id: item.accountId, currency: item.currency },
        to: { id: item.toAccountId, currency: item.toCurrency },
        amountOut: item.amountMinor as never,
        amountIn: (item.amountInMinor ?? item.amountMinor) as never,
        localDate: item.localDate,
      });
      if (!built.ok) throw new TypeError(`buildEntryListWrite: invalid transfer (${built.error})`);
      for (const leg of built.legs) {
        rows.push({
          id: leg.id,
          household_id: ctx.householdId,
          account_id: leg.accountId,
          original_amount: leg.amount,
          original_currency: leg.currency,
          local_date: leg.localDate,
          time_zone: ctx.timeZone,
          note: item.note.length > 0 ? item.note : null,
          name: null,
          category_id: ctx.transferCategoryId,
          payment_type: null,
          status: 'paid',
          transfer_id: leg.transferId,
        });
      }
      continue;
    }

    // Sign rule mirrors the single save: positive iff money in or a refund.
    const positive = item.type === 'in' || item.refund;
    const row: NewTransaction = {
      id: mint(),
      household_id: ctx.householdId,
      account_id: item.accountId,
      original_amount: positive ? item.amountMinor : -item.amountMinor,
      original_currency: item.currency,
      local_date: item.localDate,
      time_zone: ctx.timeZone,
      note: item.note.length > 0 ? item.note : null,
      name: item.name.trim(),
      category_id: item.categoryId,
      payment_type: allowedPaymentType(item),
      status: item.status,
      is_refund: item.type === 'out' && item.refund,
      is_automatic: item.automatic,
    };
    rows.push(row);

    const schedule = repeatToSchedule(item.repeat);
    if (schedule !== null) {
      series.push({
        series: seriesInputFromRow(
          {
            household_id: row.household_id,
            account_id: row.account_id,
            original_amount: row.original_amount,
            original_currency: row.original_currency,
            category_id: row.category_id ?? null,
            payment_type: row.payment_type ?? null,
            time_zone: row.time_zone,
            local_date: row.local_date,
            name: row.name ?? null,
            is_automatic: item.automatic,
          },
          schedule,
          mint()
        ),
        anchorTransactionId: row.id,
      });
    }
  }

  if (rows.length > MAX_ROWS) {
    throw new RangeError(`buildEntryListWrite: ${rows.length} rows is outside 1..${MAX_ROWS}`);
  }
  return { rows, series };
}

/** The persisted variables of a list save. */
export interface BulkAddVars {
  householdId: string;
  ownerId: string;
  homeCurrency: string;
  rows: NewTransaction[];
  series: EntryListSeriesItem[];
  stepId: string;
  n: number;
}

type InsertedRow = Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>;
interface BulkAddResult {
  inserted: number;
  rateRows: InsertedRow[];
}

export function registerBulkAddMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.bulkAdd, {
    mutationFn: (vars: BulkAddVars) =>
      guardSession(vars, async (): Promise<BulkAddResult> => {
        const client = await writeClient();
        const collected: InsertedRow[] = [];
        for (let i = 0; i < vars.rows.length; i += IMPORT_CHUNK_MAX) {
          collected.push(...(await insertTransactionsBatch(client, vars.rows.slice(i, i + IMPORT_CHUNK_MAX))));
        }
        if (collected.length > 0) {
          maybeRequestSampleClearPrompt(qc, { householdId: vars.householdId, userId: vars.ownerId });
        }
        // Called even when nothing was inserted: a replay answers 'already-applied'.
        await recordEntryList(
          client,
          vars.rows.map((r) => r.id),
          vars.series,
          { id: vars.stepId, labelKey: 'addedMany', labelParams: { n: vars.n } }
        );
        return { inserted: collected.length, rateRows: collected };
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: BulkAddVars) => {
      markSession(vars);
      const now = new Date().toISOString();
      for (const row of vars.rows) {
        placeRowInMonth(
          qc,
          vars.householdId,
          optimisticTransactionRow(qc, { ownerId: vars.ownerId, homeCurrency: vars.homeCurrency }, row, now),
          []
        );
      }
    },
    onSuccess: (result: BulkAddResult, vars: BulkAddVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
      invalidateDerivedReads(qc, vars.householdId);
      const pending = result.rateRows.filter((r) => r.rate_pending);
      if (pending.length > 0) {
        void followUpPendingByDate(
          qc,
          pending.map((r) => ({ ...r, household_id: vars.householdId }))
        );
      }
    },
    onError: async (err: unknown, vars: BulkAddVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const ids = new Set(vars.rows.map((r) => r.id));
      for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (rows) => rows.filter((r) => !ids.has(r.id)));
      }
      // Rows that landed before a refused RPC reappear from the server rather than vanish.
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
      // Ids and counts only (T-02.3-13-04): never names or amounts.
      await recordFailedWrite({
        entity: 'transactions',
        entityId: vars.stepId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { count: vars.rows.length },
      });
      showToast({ kind: 'refusal', text: { key: 'undo.batchRefused' } });
    },
  });
}

export function useBulkAdd(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  save(items: readonly ListItem[], ctx: BulkAddContext): string;
} {
  const mutation = useMutation<BulkAddResult, unknown, BulkAddVars>({
    mutationKey: mutationKeys.bulkAdd,
    scope: WRITE_SCOPE,
  });

  return {
    save(items, ctx): string {
      const n = items.length;
      if (n === 0) throw new RangeError('useBulkAdd: nothing to save');
      const write = buildEntryListWrite(items, ctx, () => Crypto.randomUUID());
      const stepId = newStepId();
      mutation.mutate({
        householdId: ctx.householdId,
        ownerId: ctx.ownerId,
        homeCurrency: ctx.homeCurrency,
        rows: write.rows,
        series: write.series,
        stepId,
        n,
      });
      return stepId;
    },
  };
}
