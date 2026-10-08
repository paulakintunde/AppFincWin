// Pure Frankfurter v2 response validator/mapper. Zero imports so this file
// loads identically under Deno (the fx-sync Edge Function) and Jest
// (parse.test.ts) with no runtime-specific glue.
//
// Pinned to /v2 deliberately -- v1 only covers ~30 ECB currencies (PROJECT.md).
export const FRANKFURTER_V2_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

export interface FxRow {
  base: string;
  quote: string;
  rate: string;
  date: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export function parseFrankfurterRates(json: unknown): FxRow[] {
  if (!Array.isArray(json)) {
    if (json !== null && typeof json === 'object' && 'rates' in (json as Record<string, unknown>)) {
      throw new Error('Frankfurter v1 response shape received; this project is pinned to /v2 (array of {date,base,quote,rate})');
    }
    throw new Error('Frankfurter response is not an array; expected the /v2 shape');
  }
  if (json.length === 0) {
    throw new Error('Frankfurter v2 response has no rates');
  }

  const rows: FxRow[] = [];

  json.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`Frankfurter v2 entry at index ${index} is not an object`);
    }
    const { date, base, quote, rate } = entry as Record<string, unknown>;

    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new Error(`Frankfurter v2 entry at index ${index} has a non-ISO date: ${String(date)}`);
    }
    if (typeof base !== 'string' || !CURRENCY_RE.test(base)) {
      throw new Error(`Frankfurter v2 entry at index ${index} has an invalid base currency: ${String(base)}`);
    }
    if (typeof quote !== 'string' || !CURRENCY_RE.test(quote)) {
      throw new Error(`Frankfurter v2 entry at index ${index} has an invalid quote currency: ${String(quote)}`);
    }
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Frankfurter v2 entry at index ${index} has an invalid rate: ${String(rate)}`);
    }

    if (base === quote) {
      return; // same-currency entries are skipped, not an error
    }

    rows.push({ base, quote, rate: String(rate), date });
  });

  return rows;
}
