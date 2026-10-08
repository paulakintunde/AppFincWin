// The only client module that calls the resolve-rate Edge Function
// (02-DECISION-fx-on-demand.md items 3 and 7). Read paths -- balances, totals, Decide --
// must never import it: they use the latest stored rate and never fetch on their own.
//
// Server contract (plan 02-44):
//   A) body { transactionId }                 -> { ok, pending, row }
//   B) body { transactionIds: [] }            -> { ok, rows }   (1..50 ids)
//   C) body { ensure: { date, currencies } }  -> { ok, stored } (1..50 codes)
// A network-layer failure (FunctionsFetchError) is transient and rethrown so the caller's retry
// policy handles it; a 429 notes the client-side throttle; any other HTTP-layer failure is
// swallowed to `null` -- the row stays rate_pending and a later call or the pending sweep retries.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { noteResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import { toDbError } from './errors';
import type { DbClient, TransactionRow } from './rows';

/**
 * WR-A15: upper bound on one resolve-rate call. The call is best-effort (a row that stays
 * rate_pending is picked up later), so a slow upstream backfill must never hang a caller.
 */
export const RATE_RESOLUTION_TIMEOUT_MS = 15_000;
export const MAX_IDS_PER_CALL = 50;
export const MAX_CODES_PER_ENSURE = 50;

async function invokeResolveRate<T>(client: DbClient, body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await client.functions.invoke('resolve-rate', {
    body,
    timeout: RATE_RESOLUTION_TIMEOUT_MS,
  });

  if (error) {
    if (error instanceof FunctionsFetchError) throw error;
    // RD-05: a 429 from resolve-rate's own per-user throttle is never a permanent failure, but
    // the client notes it so a burst of other pending writes does not keep calling an endpoint
    // that has already asked it to slow down (see resolveRateBackoff.ts).
    if (error instanceof FunctionsHttpError && (error.context as { status?: number } | undefined)?.status === 429) {
      noteResolveRateThrottled();
    }
    return null;
  }
  return (data as T | null) ?? null;
}

/** D-17: resolve one `rate_pending` row. */
export async function requestRateResolution(client: DbClient, transactionId: string): Promise<TransactionRow | null> {
  const data = await invokeResolveRate<{ row?: TransactionRow }>(client, { transactionId });
  return data?.row ?? null;
}

/** Resolve many rows (1..50) in one call; the server fetches each distinct date once. */
export async function requestRateResolutionBatch(
  client: DbClient,
  transactionIds: string[],
): Promise<TransactionRow[] | null> {
  if (transactionIds.length === 0 || transactionIds.length > MAX_IDS_PER_CALL) {
    throw new RangeError(`requestRateResolutionBatch: need 1..${MAX_IDS_PER_CALL} ids, got ${transactionIds.length}`);
  }
  const data = await invokeResolveRate<{ rows?: TransactionRow[] }>(client, { transactionIds });
  return data?.rows ?? null;
}

/** Ask the server to store rates for these currencies on one date. Returns the stored codes. */
export async function requestRatesForDate(
  client: DbClient,
  date: string,
  currencies: string[],
): Promise<string[] | null> {
  const distinct = [...new Set(currencies)];
  if (distinct.length === 0 || distinct.length > MAX_CODES_PER_ENSURE) {
    throw new RangeError(`requestRatesForDate: need 1..${MAX_CODES_PER_ENSURE} distinct codes, got ${distinct.length}`);
  }
  const data = await invokeResolveRate<{ stored?: string[] }>(client, { ensure: { date, currencies: distinct } });
  return data?.stored ?? null;
}

export type RatePendingRow = Pick<TransactionRow, 'id' | 'household_id' | 'local_date' | 'rate_pending'>;

/** Read live rate_pending rows (RLS scopes to the caller's households). */
export async function fetchRatePendingRows(
  client: DbClient,
  opts: { onOrBefore: string; limit: number; order?: 'asc' | 'desc'; recurringSeriesId?: string },
): Promise<RatePendingRow[]> {
  let query = client
    .from('transactions')
    .select('id, household_id, local_date, rate_pending')
    .eq('rate_pending', true)
    .is('deleted_at', null)
    .lte('local_date', opts.onOrBefore);
  if (opts.recurringSeriesId !== undefined) query = query.eq('recurring_series_id', opts.recurringSeriesId);
  const { data, error, status } = await query
    .order('local_date', { ascending: (opts.order ?? 'desc') === 'asc' })
    .limit(opts.limit);
  if (error) throw toDbError(error, status);
  return (data as RatePendingRow[] | null) ?? [];
}
