// Shared cache helpers for the transaction and transfer mutation modules: month-cache
// patching that never fabricates an unloaded month, derived-read invalidation, and the
// resolve-rate follow-up. Extracted from transactions.ts (02-40) so transfers.ts can use them
// without a transactions <-> transfers import cycle.
import type { QueryClient } from '@tanstack/react-query';
import { monthOf } from '@/engine/time';
import { requestRateResolution, requestRateResolutionBatch, MAX_IDS_PER_CALL } from '@/db/fxResolve';
import type { DbClient, TransactionRow } from '@/db/rows';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { isResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import { upsertRow } from './cacheRows';

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
export function lazySupabaseClient(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

export function patchMonthCache(
  qc: QueryClient,
  householdId: string,
  month: string,
  updater: (rows: TransactionList) => TransactionList
): void {
  qc.setQueryData<TransactionList>(queryKeys.transactionsMonth(householdId, month), (old) => updater(old ?? []));
}

export function patchMonthCacheIfLoaded(
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

/**
 * C-WR-04: the reads derived from transactions that are not month caches -- account
 * balances and standing (REC-08/REC-17), the month switcher, and search results -- go stale
 * on every transaction write, and focusManager only refetches on app foreground, not on a tab
 * change. Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited
 * (WR-A15), and these refetches must never delay the next queued write.
 */
export function invalidateDerivedReads(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.accountBalances(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.transactionMonths(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsSearchRoot(householdId) });
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
export function placeRowInMonth(
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
export async function followUpIfRatePending(
  qc: QueryClient,
  householdId: string,
  month: string,
  row: Pick<TransactionRow, 'id' | 'rate_pending'>
): Promise<void> {
  if (!row.rate_pending) return;
  // RD-05: resolve-rate's own per-user throttle already answered 429 recently -- skip this
  // call entirely rather than adding to the pile; the row stays rate_pending and a later
  // write's follow-up (once the cooldown passes) or the pending sweep (02-47) resolves
  // it instead.
  if (isResolveRateThrottled()) return;
  try {
    const resolved = await requestRateResolution(lazySupabaseClient(), row.id);
    // A returned call may have stored a new rate: refresh cached latest rates so balances use it.
    void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
    if (resolved) {
      // C-WR-03: only a month already loaded. This runs after the caller's invalidation, so a
      // fabricated `[]` for a month never opened would not be refetched -- it would show as an
      // empty month (status success) and be persisted.
      patchMonthCacheIfLoaded(qc, householdId, month, (rows) => rows.map((r) => (r.id === resolved.id ? resolved : r)));
    }
  } catch {
    // Network/function failure: the row stays rate_pending; the pending sweep (02-47) retries it.
  }
}

export const MAX_RESOLVE_CALLS_PER_BATCH = 20;

/**
 * Follows up many rate_pending rows with one resolve-rate call per distinct local_date
 * (chunked to MAX_IDS_PER_CALL ids), most recent dates first, at most `maxCalls` calls. Never
 * throws; callers do not await it (WR-A15). `stillPendingDates` lists dates whose returned rows
 * are all still rate_pending or whose call returned nothing, so the sweep can back off on them.
 */
export async function followUpPendingByDate(
  qc: QueryClient,
  rows: readonly Pick<TransactionRow, 'id' | 'household_id' | 'local_date' | 'rate_pending'>[],
  opts?: { maxCalls?: number }
): Promise<{ calls: number; stillPendingDates: string[] }> {
  const maxCalls = opts?.maxCalls ?? MAX_RESOLVE_CALLS_PER_BATCH;
  const result = { calls: 0, stillPendingDates: [] as string[] };
  if (isResolveRateThrottled()) return result;

  const byDate = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.rate_pending) continue;
    const ids = byDate.get(r.local_date);
    if (ids) ids.push(r.id);
    else byDate.set(r.local_date, [r.id]);
  }
  const dates = [...byDate.keys()].sort().reverse();

  const pendingByDate = new Map<string, boolean>();
  try {
    outer: for (const date of dates) {
      const ids = byDate.get(date) ?? [];
      for (let i = 0; i < ids.length; i += MAX_IDS_PER_CALL) {
        if (result.calls >= maxCalls || isResolveRateThrottled()) break outer;
        result.calls += 1;
        let returned: TransactionRow[] | null = null;
        try {
          returned = await requestRateResolutionBatch(lazySupabaseClient(), ids.slice(i, i + MAX_IDS_PER_CALL));
        } catch {
          // Network/function failure: rows stay rate_pending; the pending sweep retries them.
        }
        const stillPending = returned === null || returned.some((r) => r.rate_pending);
        pendingByDate.set(date, (pendingByDate.get(date) ?? false) || stillPending);
        for (const resolved of returned ?? []) {
          patchMonthCacheIfLoaded(qc, resolved.household_id, monthOf(resolved.local_date), (list) =>
            list.map((r) => (r.id === resolved.id ? resolved : r))
          );
        }
      }
    }
  } finally {
    if (result.calls > 0) void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
  }
  result.stillPendingDates = dates.filter((d) => pendingByDate.get(d) === true);
  return result;
}
