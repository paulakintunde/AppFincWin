// open.er-api fallback (MON-12) -- used only when Frankfurter is
// unreachable, errors, or returns an unparsable body. Zero imports (besides
// the type-only FxRow import, erased at compile time) so this file loads
// identically under Deno and Jest, exactly like parse.ts.
//
// There is no historical endpoint on the free tier (verified live
// 2026-09-24) -- this is a latest-only fallback for the daily sync, never a
// backfill source. The date stamped on every row comes from the provider's
// own publication time (time_last_update_utc), not "today" -- MON-07
// surfaces this as the rate's publication date.
import type { FxRow } from './parse.ts';

export const OPEN_ER_API_URL = 'https://open.er-api.com/v6/latest';
// D-13: verbatim required attribution text -- do not paraphrase.
export const OPEN_ER_API_ATTRIBUTION = 'Rates By Exchange Rate API';
export const OPEN_ER_API_ATTRIBUTION_URL = 'https://www.exchangerate-api.com';

interface OpenErApiResponse {
  result: string;
  base_code: string;
  time_last_update_utc: string;
  rates: Record<string, number>;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

export function parseOpenErApiRates(json: unknown): FxRow[] {
  if (json === null || typeof json !== 'object') {
    throw new Error('open.er-api response is not an object');
  }
  const body = json as OpenErApiResponse;

  if (body.result !== 'success') {
    throw new Error(`open.er-api returned result=${String(body.result)}`);
  }
  // The project stores EUR-based rates only (fx_rates.base is always 'EUR').
  if (body.base_code !== 'EUR') {
    throw new Error(`open.er-api base_code is not EUR: ${String(body.base_code)}`);
  }

  const parsedDate = new Date(body.time_last_update_utc);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`open.er-api time_last_update_utc is unparsable: ${String(body.time_last_update_utc)}`);
  }
  const date = parsedDate.toISOString().slice(0, 10);

  if (body.rates === null || typeof body.rates !== 'object') {
    throw new Error('open.er-api response has no rates');
  }

  const rows: FxRow[] = [];
  for (const [quote, rate] of Object.entries(body.rates)) {
    if (quote === body.base_code) continue; // same-currency entry, skipped like parse.ts

    if (!CURRENCY_RE.test(quote)) {
      throw new Error(`open.er-api rates key is not a valid ISO currency code: ${quote}`);
    }
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`open.er-api rate for ${quote} is invalid: ${String(rate)}`);
    }

    rows.push({ base: body.base_code, quote, rate: String(rate), date });
  }

  return rows;
}
