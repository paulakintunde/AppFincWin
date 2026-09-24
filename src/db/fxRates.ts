// MON-06: the app reads FX rates only from the project's own store, via the
// `fx_latest_rates` RPC plan 01-08 provides (same wave; interface documented in
// 01-10-PLAN.md's <interfaces> block: `fx_latest_rates(p_on_or_before date default null)
// returns table (quote text, rate text, rate_date date, source text)`). Never an FX
// provider URL directly (T-01-10-04).

import { toDbError } from './errors';
import type { DbClient, FxLatestRow } from './rows';

/**
 * D-17: offline foreign entries convert provisionally using the nearest cached rate --
 * `onOrBefore` lets a caller pin that lookup to a specific date instead of "today".
 */
export async function fetchFxLatest(client: DbClient, onOrBefore?: string): Promise<FxLatestRow[]> {
  const { data, error, status } = await client.rpc('fx_latest_rates', { p_on_or_before: onOrBefore ?? null });

  if (error) throw toDbError(error, status);
  return (data as FxLatestRow[] | null) ?? [];
}
