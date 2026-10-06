// SYN-02/MON-08: paused-mutation defaults for transactions, plus the useAddTransaction/
// useEditTransaction hooks that build a client UUID (MON-08) before mutate() ever runs.
//
// Registering these defaults (rather than passing an inline write function to useMutation)
// is what lets a mutation restored from the persisted cache resume with real code after an
// app restart (Pitfall 3,
// RESEARCH.md) -- registerTransactionMutations must run once, at module scope, before
// PersistQueryClientProvider restores (wired in src/data/QueryProvider.tsx, this plan's
// Task 3).
//
// Record (Phase 2, plan 02-15): every add/edit/delete/mark-paid/skip captures its own undo
// step at the moment the forward write succeeds (D-23, D-29) via recordUndoStepSafely --
// never a second write pipeline (RESEARCH.md Anti-pattern 1). Import chunks (D-17) go
// through this same queue too; the import's own undo step is recorded by
// importFinalize.ts's finalize write, not here.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { localDateIn, monthOf } from '@/engine/time';
import type { MinorUnits } from '@/engine/money';
import { markPaidDate } from '@/engine/activity';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { insertTransaction, insertTransactionsBatch, requestRateResolution, updateTransaction, IMPORT_CHUNK_MAX } from '@/db/transactions';
import type {
  CustomCurrencyRow,
  DbClient,
  FxLatestRow,
  NewTransaction,
  PaymentType,
  TransactionPatch,
  TransactionRow,
  TransactionStatus,
} from '@/db/rows';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { isResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import { writeClient } from './writeClient';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { editStamp, provisionalStamp } from './provisional';
import { newStepId, recordUndoStepSafely, type UndoCapture } from './undoCapture';

export interface AddTransactionVars {
  row: NewTransaction;
  optimistic: { homeCurrency: string; createdBy: string; month: string };
  undo?: UndoCapture;
}

export interface EditTransactionVars {
  id: string;
  householdId: string;
  month: string;
  expectedVersion: number;
  patch: TransactionPatch;
  /**
   * @deprecated Ignored. WR-A06/D-05: an edit's optimistic stamp uses the row's own
   * `home_currency` (the server pins it on update), never the current preference. Kept
   * optional so existing callers still type-check.
   */
  homeCurrency?: string;
  /** REC-11: captured by useEditTransaction's wrapper (the hook computes `before` itself). */
  undo?: UndoCapture & { before: Readonly<Record<string, PatchValue>> };
}

type TransactionList = WithPending<TransactionRow>[];

// Deviation (Rule 3 - blocking): the plan specifies a lazy `await import('@/services/supabase')`
// inside the write function (mirroring 00-10's checkConnection pattern), so importing this
// module in tests or before env is ready never triggers services/supabase's eager getEnv()
// call. Under this project's Jest config (CommonJS transform, no --experimental-vm-modules),
// a dynamic `import()` call throws "A dynamic import callback was invoked without
// --experimental-vm-modules" the moment it actually runs -- unlike connection.ts's identical
// pattern, this plan's own tests genuinely exercise the lazy-load path (the write function
// always runs), so the bug surfaces here where it stayed latent there. `require()` is exactly
// as lazy (evaluated at call time, not module load) and is fully supported by both Jest and
// Metro (which compiles `import` to `require` under the hood anyway).
function lazySupabaseClient(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

function patchMonthCache(
  qc: QueryClient,
  householdId: string,
  month: string,
  updater: (rows: TransactionList) => TransactionList
): void {
  qc.setQueryData<TransactionList>(queryKeys.transactionsMonth(householdId, month), (old) => updater(old ?? []));
}

function patchMonthCacheIfLoaded(
  qc: QueryClient,
  householdId: string,
  month: string,
  updater: (rows: TransactionList) => TransactionList
): void {
  // Never creates a month list that was not loaded: a one-row list would pass for the whole
  // month (status success, fresh dataUpdatedAt) and show wrong totals.
  if (qc.getQueryData<TransactionList>(queryKeys.transactionsMonth(householdId, month)) === undefined) return;
  patchMonthCache(qc, householdId, month, updater);
}

/** The month an edit leaves the row in: the patched local_date's month, else the original. */
function targetMonth(vars: EditTransactionVars): string {
  return vars.patch.local_date !== undefined ? monthOf(vars.patch.local_date) : vars.month;
}

/**
 * WR-A05: puts `row` into the month its own local_date belongs to (replacing it in place if
 * it is already there) and removes it from every other month in `fromMonths`. An edit that
 * moves a transaction's date across a month boundary would otherwise leave it in the old
 * month's list and missing from the new one, so both months' totals are wrong.
 *
 * D-30: when the row is now soft-deleted, it leaves every cached month at once (its own
 * month included) instead of being upserted anywhere -- a deleted row must never reappear
 * in a month list just because it was just patched.
 */
function placeRowInMonth(
  qc: QueryClient,
  householdId: string,
  row: WithPending<TransactionRow>,
  fromMonths: readonly string[]
): void {
  const month = monthOf(row.local_date);
  const everyMonth = new Set([...fromMonths, month]);

  if (row.deleted_at !== null) {
    for (const m of everyMonth) {
      patchMonthCacheIfLoaded(qc, householdId, m, (rows) => rows.filter((r) => r.id !== row.id));
    }
    return;
  }

  for (const from of new Set(fromMonths)) {
    if (from !== month) patchMonthCacheIfLoaded(qc, householdId, from, (rows) => rows.filter((r) => r.id !== row.id));
  }
  patchMonthCacheIfLoaded(qc, householdId, month, (rows) => upsertRow(rows, row, 'start'));
}

/** After a write comes back rate_pending, calls resolve-rate and writes the restamped row in. */
async function followUpIfRatePending(
  qc: QueryClient,
  householdId: string,
  month: string,
  row: Pick<TransactionRow, 'id' | 'rate_pending'>
): Promise<void> {
  if (!row.rate_pending) return;
  // RD-05: resolve-rate's own per-user throttle already answered 429 recently -- skip this
  // call entirely rather than adding to the pile; the row stays rate_pending and a later
  // write's follow-up (once the cooldown passes), or the daily background restamp, resolves
  // it instead.
  if (isResolveRateThrottled()) return;
  try {
    const resolved = await requestRateResolution(lazySupabaseClient(), row.id);
    if (resolved) {
      // C-WR-03: only a month already loaded. This runs after the caller's invalidation, so a
      // fabricated `[]` for a month never opened would not be refetched -- it would show as an
      // empty month (status success) and be persisted.
      patchMonthCacheIfLoaded(qc, householdId, month, (rows) => rows.map((r) => (r.id === resolved.id ? resolved : r)));
    }
  } catch {
    // Network/function failure: the row stays rate_pending; fx-monitor reports stuck rows.
  }
}

export interface ImportChunkVars {
  householdId: string;
  batchId: string;
  rows: NewTransaction[];
  optimistic: { homeCurrency: string; createdBy: string };
}

type ImportChunkResult = Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>[];

/**
 * D-52's "never splitting the two legs of a new transfer across chunks": rows sharing a
 * `transfer_id` are grouped into one unit that is never split across a chunk boundary, so a
 * chunk stays at or under `max` except when a single linked group itself would not fit
 * (never happens in practice -- a transfer is always exactly two legs). Order is otherwise
 * preserved.
 *
 * Deviation (Rule 3 - blocking): the plan places this function in importFinalize.ts (Task
 * 3), with useImportChunks (this file, Task 2) importing it from there. That is a genuine
 * import cycle (importFinalize.ts's useImportCommit also imports useImportChunks from this
 * file) which `npm run depcruise`'s `no-circular` rule rejects unconditionally. Defining it
 * here instead -- the one file that actually needs it at the value level -- and having
 * importFinalize.ts re-export it keeps both modules' documented public shape intact with a
 * one-directional dependency (importFinalize.ts -> transactions.ts, never the reverse).
 */
export function chunkKeepingPairs(rows: readonly NewTransaction[], max: number): NewTransaction[][] {
  if (max <= 0) throw new RangeError(`chunkKeepingPairs: max must be positive, got ${max}`);

  const units: NewTransaction[][] = [];
  const byTransferId = new Map<string, NewTransaction[]>();
  for (const row of rows) {
    if (row.transfer_id) {
      const group = byTransferId.get(row.transfer_id);
      if (group) {
        group.push(row);
        continue; // already placed at its transfer_id's first-occurrence unit
      }
      const created: NewTransaction[] = [row];
      byTransferId.set(row.transfer_id, created);
      units.push(created);
    } else {
      units.push([row]);
    }
  }

  const chunks: NewTransaction[][] = [];
  let current: NewTransaction[] = [];
  for (const unit of units) {
    if (unit.length > max) {
      throw new RangeError(`chunkKeepingPairs: a linked group of ${unit.length} rows exceeds max (${max})`);
    }
    if (current.length > 0 && current.length + unit.length > max) {
      chunks.push(current);
      current = [];
    }
    current.push(...unit);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function registerTransactionMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addTransaction, {
    mutationFn: (vars: AddTransactionVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertTransaction(client, vars.row);
        if (vars.undo) {
          const step = buildStep(
            vars.undo.stepId,
            vars.undo.labelKey,
            vars.undo.labelParams,
            inverseOfInserts('transactions', [{ id: row.id, version: row.version }])
          );
          await recordUndoStepSafely(qc, client, step, vars.undo.ownerId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddTransactionVars) => {
      markSession(vars); // WR-A09
      const monthKey = queryKeys.transactionsMonth(vars.row.household_id, vars.optimistic.month);
      // C-WR-03: a month that was never loaded is not fabricated as a one-row list (it would
      // pass for the whole month and show wrong totals). onSuccess invalidates it instead.
      if (qc.getQueryData(monthKey) === undefined) return;
      await qc.cancelQueries({ queryKey: monthKey });

      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.optimistic.createdBy)) ?? [];
      const stamp = provisionalStamp(
        {
          amount: vars.row.original_amount,
          currency: vars.row.original_currency,
          homeCurrency: vars.optimistic.homeCurrency,
          localDate: vars.row.local_date,
        },
        rates,
        customs
      );
      const now = new Date().toISOString();
      const optimisticRow: WithPending<TransactionRow> = {
        id: vars.row.id,
        household_id: vars.row.household_id,
        account_id: vars.row.account_id,
        created_by: vars.optimistic.createdBy,
        original_amount: vars.row.original_amount,
        original_currency: vars.row.original_currency,
        home_currency: vars.optimistic.homeCurrency,
        home_amount: stamp.home_amount,
        rate: stamp.rate,
        orig_per_eur: stamp.orig_per_eur,
        home_per_eur: stamp.home_per_eur,
        // RD-03 follow-up: the raw custom-leg stamp is server-only and unknown until the
        // server's own stamp lands (D-16) -- an insert's optimistic row never has one yet,
        // same as it never had a real rate_pending: false before now.
        orig_custom_unit_value: null,
        orig_custom_ref_per_eur: null,
        home_custom_unit_value: null,
        home_custom_ref_per_eur: null,
        rate_date: stamp.rate_date,
        rate_source: stamp.rate_source,
        rate_pending: stamp.rate_pending,
        local_date: vars.row.local_date,
        time_zone: vars.row.time_zone,
        note: vars.row.note,
        // Record (Phase 2): mirror what the insert actually sent; server-only columns
        // (recurring_series_id, occurrence_date, updated_by) start null on an optimistic row.
        name: vars.row.name ?? null,
        category_id: vars.row.category_id ?? null,
        payment_type: vars.row.payment_type ?? null,
        status: vars.row.status ?? 'paid', // D-01: hand-entered rows default to paid
        deleted_at: null,
        import_batch_id: vars.row.import_batch_id ?? null,
        recurring_series_id: null,
        occurrence_date: null,
        updated_by: null,
        raw_amount: vars.row.raw_amount ?? null,
        raw_balance: vars.row.raw_balance ?? null,
        external_id: vars.row.external_id ?? null,
        import_format: vars.row.import_format ?? null,
        transfer_id: vars.row.transfer_id ?? null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchMonthCacheIfLoaded(qc, vars.row.household_id, vars.optimistic.month, (rows) => [optimisticRow, ...rows]);
    },
    onSuccess: (row: TransactionRow, vars: AddTransactionVars) => {
      const monthKey = queryKeys.transactionsMonth(vars.row.household_id, vars.optimistic.month);
      if (qc.getQueryData(monthKey) === undefined) {
        // C-WR-03: not loaded -- mark it stale rather than create it (not awaited, WR-A15).
        void qc.invalidateQueries({ queryKey: monthKey });
      } else {
        // WR-A04: upsert, not replace -- a refetch may have dropped the optimistic row.
        patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) => upsertRow(rows, row, 'start'));
      }
      // WR-A15: not awaited. query-core awaits onSuccess before releasing WRITE_SCOPE, so an
      // awaited Edge Function call would hold every later queued write behind it.
      void followUpIfRatePending(qc, vars.row.household_id, vars.optimistic.month, row);
    },
    onError: async (err: unknown, vars: AddTransactionVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // an insert never conflicts; a duplicate-id insert already resolved to success in db/
      patchMonthCacheIfLoaded(qc, vars.row.household_id, vars.optimistic.month, (rows) =>
        rows.filter((r) => r.id !== vars.row.id)
      );
      await recordFailedWrite({
        entity: 'transactions',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editTransaction, {
    mutationFn: (vars: EditTransactionVars) =>
      guardSession(vars, async () => {
        // CR-A02: an earlier queued edit of this same row may already have bumped its version.
        const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
        const client = await writeClient();
        // WR-A13: a replayed edit that already landed resolves as applied, not a conflict.
        const row = await updateTransaction(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<TransactionRow>(err, vars.patch)
        );
        recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], row.version);
        if (vars.undo) {
          const step = buildStep(
            vars.undo.stepId,
            vars.undo.labelKey,
            vars.undo.labelParams,
            inverseOfPatches('transactions', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
          );
          await recordUndoStepSafely(qc, client, step, vars.undo.ownerId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditTransactionVars) => {
      markSession(vars); // WR-A09
      const toMonth = targetMonth(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      if (toMonth !== vars.month) {
        await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, toMonth) });
      }

      const current = qc
        .getQueryData<TransactionList>(queryKeys.transactionsMonth(vars.householdId, vars.month))
        ?.find((r) => r.id === vars.id);
      if (!current) return;

      // WR-A06: mirror the server's D-04/D-05 rules (keep the row's own home currency; an
      // amount-only edit keeps the stored rate) instead of re-rating at today's rate.
      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(current.created_by ?? '')) ?? [];
      const stamp = editStamp(current, vars.patch, rates, customs);
      const patched: WithPending<TransactionRow> = { ...current, ...vars.patch, ...stamp, pending: true };
      placeRowInMonth(qc, vars.householdId, patched, [vars.month]);
    },
    onSuccess: async (row: TransactionRow, vars: EditTransactionVars) => {
      const toMonth = targetMonth(vars);
      placeRowInMonth(qc, vars.householdId, row, [vars.month, toMonth]);
      if (toMonth !== vars.month || monthOf(row.local_date) !== toMonth) {
        // WR-A05: the row changed months; refetch both so their totals come from the server.
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, monthOf(row.local_date)) });
      }
      void followUpIfRatePending(qc, vars.householdId, monthOf(row.local_date), row); // WR-A15: not awaited
    },
    onError: async (err: unknown, vars: EditTransactionVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as TransactionRow;
        placeRowInMonth(qc, vars.householdId, serverRow, [vars.month, targetMonth(vars)]);
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: vars.patch,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
        if (targetMonth(vars) !== vars.month) {
          await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, targetMonth(vars)) });
        }
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });

  qc.setMutationDefaults(mutationKeys.importChunk, {
    mutationFn: (vars: ImportChunkVars) => guardSession(vars, async () => insertTransactionsBatch(await writeClient(), vars.rows)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ImportChunkVars) => {
      markSession(vars); // WR-A09
      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.optimistic.createdBy)) ?? [];
      const now = new Date().toISOString();

      // D-17: prepended into month caches that are already loaded only -- never fabricates a
      // month that was not loaded (same rule as patchMonthCacheIfLoaded's single-row callers).
      const byMonth = new Map<string, WithPending<TransactionRow>[]>();
      for (const tx of vars.rows) {
        const stamp = provisionalStamp(
          { amount: tx.original_amount, currency: tx.original_currency, homeCurrency: vars.optimistic.homeCurrency, localDate: tx.local_date },
          rates,
          customs
        );
        const optimisticRow: WithPending<TransactionRow> = {
          id: tx.id,
          household_id: vars.householdId,
          account_id: tx.account_id,
          created_by: vars.optimistic.createdBy,
          original_amount: tx.original_amount,
          original_currency: tx.original_currency,
          home_currency: vars.optimistic.homeCurrency,
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
          name: tx.name ?? null,
          category_id: tx.category_id ?? null,
          payment_type: tx.payment_type ?? null,
          status: tx.status ?? 'paid', // D-15: imported rows are paid
          deleted_at: null,
          import_batch_id: tx.import_batch_id ?? vars.batchId,
          recurring_series_id: null,
          occurrence_date: null,
          updated_by: null,
          raw_amount: tx.raw_amount ?? null,
          raw_balance: tx.raw_balance ?? null,
          external_id: tx.external_id ?? null,
          import_format: tx.import_format ?? null,
          transfer_id: tx.transfer_id ?? null,
          version: 1,
          created_at: now,
          updated_at: now,
          pending: true,
        };
        const month = monthOf(tx.local_date);
        const list = byMonth.get(month);
        if (list) list.push(optimisticRow);
        else byMonth.set(month, [optimisticRow]);
      }
      for (const [month, rows] of byMonth) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (existing) => [...rows, ...existing]);
      }
    },
    onSuccess: async (rows: ImportChunkResult, vars: ImportChunkVars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });

      // D-19/D-45: one resolve-rate call per distinct (original_currency, local_date) among
      // the rows that came back rate_pending, capped at 20 per chunk -- never awaited (WR-A15).
      const currencyById = new Map(vars.rows.map((r) => [r.id, r.original_currency] as const));
      const seen = new Set<string>();
      let resolved = 0;
      for (const row of rows) {
        if (!row.rate_pending || resolved >= 20) continue;
        const currency = currencyById.get(row.id);
        if (!currency) continue;
        const dedupeKey = `${currency}:${row.local_date}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        resolved += 1;
        void followUpIfRatePending(qc, vars.householdId, monthOf(row.local_date), row);
      }
    },
    onError: async (err: unknown, vars: ImportChunkVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const ids = new Set(vars.rows.map((r) => r.id));
      const months = new Set(vars.rows.map((r) => monthOf(r.local_date)));
      for (const month of months) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (existing) => existing.filter((r) => !ids.has(r.id)));
      }
      await recordFailedWrite({
        entity: 'transactions',
        entityId: `import:${vars.batchId}`,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { import_batch_id: vars.batchId, rows: vars.rows.length },
      });
    },
  });
}

export interface AddTransactionInput {
  householdId: string;
  accountId: string;
  amount: MinorUnits;
  currency: string;
  homeCurrency: string;
  userId: string;
  note?: string | null;
  localDate?: string;
  timeZone?: string;
  name?: string | null;
  categoryId?: string | null;
  paymentType?: PaymentType | null;
  status?: TransactionStatus;
  undo?: Omit<UndoCapture, 'ownerId'>;
}

export function useAddTransaction(): { add(input: AddTransactionInput): string } {
  const mutation = useMutation<TransactionRow, unknown, AddTransactionVars>({
    mutationKey: mutationKeys.addTransaction,
    scope: WRITE_SCOPE,
  });

  return {
    add(input: AddTransactionInput): string {
      const id = Crypto.randomUUID();
      const timeZone = input.timeZone ?? getDeviceTimeZone();
      const localDate = input.localDate ?? localDateIn(new Date(), timeZone);
      const month = monthOf(localDate);

      const row: NewTransaction = {
        id,
        household_id: input.householdId,
        account_id: input.accountId,
        original_amount: input.amount,
        original_currency: input.currency,
        local_date: localDate,
        time_zone: timeZone,
        note: input.note ?? null,
        name: input.name,
        category_id: input.categoryId,
        payment_type: input.paymentType,
        status: input.status,
      };

      mutation.mutate({
        row,
        optimistic: { homeCurrency: input.homeCurrency, createdBy: input.userId, month },
        undo: input.undo ? { ...input.undo, ownerId: input.userId } : undefined,
      });
      return id;
    },
  };
}

export function useEditTransaction(): {
  edit(vars: EditTransactionVars, undo?: UndoCapture): void;
} {
  const mutation = useMutation<TransactionRow, unknown, EditTransactionVars>({
    mutationKey: mutationKeys.editTransaction,
    scope: WRITE_SCOPE,
  });
  const qc = useQueryClient();

  return {
    edit(vars: EditTransactionVars, undo?: UndoCapture): void {
      if (!undo) {
        mutation.mutate(vars);
        return;
      }

      // REC-11: `before` is captured from the cache at the moment of the action, for exactly
      // the keys this edit patches -- never reconstructed later (RESEARCH.md Anti-pattern 2).
      const current = qc
        .getQueryData<TransactionList>(queryKeys.transactionsMonth(vars.householdId, vars.month))
        ?.find((r) => r.id === vars.id);
      if (!current) {
        // Nothing cached to capture a before-state from: send the edit without an undo step
        // rather than guess -- matches the plan's "attaches vars.undo only when the row was
        // found".
        mutation.mutate(vars);
        return;
      }

      const before: Record<string, PatchValue> = {};
      for (const key of Object.keys(vars.patch)) {
        const value = (current as unknown as Record<string, PatchValue | undefined>)[key];
        before[key] = value ?? null;
      }
      mutation.mutate({ ...vars, undo: { ...undo, before } });
    },
  };
}

type UndoableRow = Pick<TransactionRow, 'id' | 'household_id' | 'local_date' | 'version' | 'name'>;

function nameParams(row: UndoableRow): { name?: string } {
  return row.name ? { name: row.name } : {};
}

export function useDeleteTransaction(): { remove(row: UndoableRow, ownerId: string): string } {
  const { edit } = useEditTransaction();
  return {
    remove(row: UndoableRow, ownerId: string): string {
      const stepId = newStepId();
      edit(
        {
          id: row.id,
          householdId: row.household_id,
          month: monthOf(row.local_date),
          expectedVersion: row.version,
          patch: { deleted_at: new Date().toISOString() },
        },
        { stepId, ownerId, labelKey: 'deleted', labelParams: nameParams(row) }
      );
      return stepId;
    },
  };
}

export function useMarkPaid(): {
  markPaid(row: UndoableRow, ownerId: string, today: string, adjust?: { amount?: number; localDate?: string }): string;
} {
  const { edit } = useEditTransaction();
  return {
    markPaid(row: UndoableRow, ownerId: string, today: string, adjust?: { amount?: number; localDate?: string }): string {
      const stepId = newStepId();
      const localDate = adjust?.localDate ?? markPaidDate(today, row.local_date);
      const patch: TransactionPatch = { status: 'paid', local_date: localDate };
      if (adjust?.amount !== undefined) patch.original_amount = adjust.amount;
      edit(
        {
          id: row.id,
          householdId: row.household_id,
          month: monthOf(row.local_date),
          expectedVersion: row.version,
          patch,
        },
        { stepId, ownerId, labelKey: 'markedPaid', labelParams: nameParams(row) }
      );
      return stepId;
    },
  };
}

export function useSkipOccurrence(): { skip(row: UndoableRow, ownerId: string): string } {
  const { edit } = useEditTransaction();
  return {
    skip(row: UndoableRow, ownerId: string): string {
      const stepId = newStepId();
      edit(
        {
          id: row.id,
          householdId: row.household_id,
          month: monthOf(row.local_date),
          expectedVersion: row.version,
          patch: { status: 'skipped' },
        },
        { stepId, ownerId, labelKey: 'skipped', labelParams: nameParams(row) }
      );
      return stepId;
    },
  };
}

export interface ImportChunksInput {
  householdId: string;
  batchId: string;
  rows: NewTransaction[];
  homeCurrency: string;
  userId: string;
}

/**
 * D-17: splits `input.rows` into <= IMPORT_CHUNK_MAX chunks (never splitting a transfer
 * pair, D-52) and enqueues one importChunk mutation per chunk, in order. Records no undo
 * step itself -- importFinalize.ts's useImportCommit enqueues the finalize write (which
 * carries the import's single undo step) after every chunk.
 */
export function useImportChunks(): { enqueue(input: ImportChunksInput): void } {
  const mutation = useMutation<ImportChunkResult, unknown, ImportChunkVars>({
    mutationKey: mutationKeys.importChunk,
    scope: WRITE_SCOPE,
  });

  return {
    enqueue(input: ImportChunksInput): void {
      const chunks = chunkKeepingPairs(input.rows, IMPORT_CHUNK_MAX);
      for (const rows of chunks) {
        mutation.mutate({
          householdId: input.householdId,
          batchId: input.batchId,
          rows,
          optimistic: { homeCurrency: input.homeCurrency, createdBy: input.userId },
        });
      }
    },
  };
}
