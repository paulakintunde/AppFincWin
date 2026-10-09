// 02.2-20 (REC-19, REC-21): the one write shared by clone-month and paste-lines. A batch of
// new rows is inserted in IMPORT_CHUNK_MAX chunks inside ONE mutationFn and then recorded as
// ONE undo step (Phase 2 D-24), so a single Undo reverses the whole action.
//
// Replay safety (T-02.2-20-02): rows carry client-minted UUIDs, and insertTransactionsBatch is
// ON CONFLICT DO NOTHING, so a paused mutation replayed after its first attempt landed inserts
// nothing new. The undo step id is minted once, before mutate(), and is the server's replay key;
// a duplicate step id resolves as success inside recordUndoStepSafely's queued fallback.
import type { QueryClient } from '@tanstack/react-query';
import { monthOf } from '@/engine/time';
import { MAX_UNDO_OPS, buildStep, inverseOfInserts } from '@/engine/undo';
import { IMPORT_CHUNK_MAX, insertTransactionsBatch } from '@/db/transactions';
import type { CustomCurrencyRow, DbClient, FxLatestRow, NewTransaction, TransactionRow } from '@/db/rows';
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
import { showToast } from '@/state/undoToast';
import { maybeRequestSampleClearPrompt } from './samplePromptTrigger';
import { writeClient } from './writeClient';
import { provisionalStamp } from './provisional';
import { recordUndoStepSafely } from './undoCapture';
import {
  followUpPendingByDate,
  invalidateDerivedReads,
  patchMonthCacheIfLoaded,
  placeRowInMonth,
} from './transactionCache';

export type BatchInsertLabel = 'cloned' | 'pasted';

type InsertedRow = Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>;

/** The persisted variables of a batch insert (clone month / paste lines). */
export interface BatchInsertVars {
  householdId: string;
  ownerId: string;
  homeCurrency: string;
  timeZone: string;
  month: string;
  rows: NewTransaction[];
  stepId: string;
}

export async function insertRowsAsOneStep(
  qc: QueryClient,
  client: DbClient,
  input: { rows: NewTransaction[]; ownerId: string; stepId: string; labelKey: BatchInsertLabel }
): Promise<{ inserted: number; rateRows: InsertedRow[] }> {
  if (input.rows.length === 0 || input.rows.length > MAX_UNDO_OPS) {
    throw new RangeError(`insertRowsAsOneStep: ${input.rows.length} rows is outside 1..${MAX_UNDO_OPS}`);
  }
  const collected: InsertedRow[] = [];
  for (let i = 0; i < input.rows.length; i += IMPORT_CHUNK_MAX) {
    const chunk = input.rows.slice(i, i + IMPORT_CHUNK_MAX);
    collected.push(...(await insertTransactionsBatch(client, chunk)));
  }
  // A full replay inserts nothing new: the first attempt already recorded the step.
  if (collected.length > 0) {
    const step = buildStep(
      input.stepId,
      input.labelKey,
      { n: input.rows.length },
      inverseOfInserts(
        'transactions',
        collected.map((r) => ({ id: r.id, version: r.version }))
      )
    );
    await recordUndoStepSafely(qc, client, step, input.ownerId);
    // D-11: clone month and paste share this path.
    maybeRequestSampleClearPrompt(qc, { householdId: input.rows[0]!.household_id, userId: input.ownerId });
  }
  return { inserted: collected.length, rateRows: collected };
}

function optimisticRow(qc: QueryClient, vars: BatchInsertVars, row: NewTransaction, now: string): WithPending<TransactionRow> {
  const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
  const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.ownerId)) ?? [];
  const stamp = provisionalStamp(
    { amount: row.original_amount, currency: row.original_currency, homeCurrency: vars.homeCurrency, localDate: row.local_date },
    rates,
    customs
  );
  return {
    id: row.id,
    household_id: row.household_id,
    account_id: row.account_id,
    created_by: vars.ownerId,
    original_amount: row.original_amount,
    original_currency: row.original_currency,
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
    local_date: row.local_date,
    time_zone: row.time_zone,
    note: row.note,
    name: row.name ?? null,
    category_id: row.category_id ?? null,
    payment_type: row.payment_type ?? null,
    status: row.status ?? 'pending',
    deleted_at: null,
    import_batch_id: null,
    recurring_series_id: null,
    occurrence_date: null,
    updated_by: null,
    raw_amount: null,
    raw_balance: null,
    external_id: null,
    import_format: null,
    transfer_id: null,
    is_refund: row.is_refund ?? false,
    is_automatic: row.is_automatic ?? false,
    is_sample: false,
    version: 1,
    created_at: now,
    updated_at: now,
    pending: true,
  } as WithPending<TransactionRow>;
}

/** Registers the shared defaults for one batch-insert mutation key. */
export function registerBatchInsert(
  qc: QueryClient,
  key: typeof mutationKeys.cloneMonth | typeof mutationKeys.pasteLines,
  labelKey: BatchInsertLabel
): void {
  qc.setMutationDefaults(key, {
    mutationFn: (vars: BatchInsertVars) =>
      guardSession(vars, async () =>
        insertRowsAsOneStep(qc, await writeClient(), {
          rows: vars.rows,
          ownerId: vars.ownerId,
          stepId: vars.stepId,
          labelKey,
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: BatchInsertVars) => {
      markSession(vars);
      const now = new Date().toISOString();
      for (const row of vars.rows) {
        placeRowInMonth(qc, vars.householdId, optimisticRow(qc, vars, row, now), []);
      }
    },
    onSuccess: (result: Awaited<ReturnType<typeof insertRowsAsOneStep>>, vars: BatchInsertVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
      const pending = result.rateRows.filter((r) => r.rate_pending);
      if (pending.length > 0) {
        void followUpPendingByDate(
          qc,
          pending.map((r) => ({ ...r, household_id: vars.householdId }))
        );
      }
    },
    onError: async (err: unknown, vars: BatchInsertVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const ids = new Set(vars.rows.map((r) => r.id));
      for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (rows) => rows.filter((r) => !ids.has(r.id)));
      }
      invalidateDerivedReads(qc, vars.householdId);
      // Ids and counts only (T-02.2-20-03): never names or amounts.
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
