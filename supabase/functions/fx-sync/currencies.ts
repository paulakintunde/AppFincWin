// Frankfurter v2 currency metadata sync (D-08). Zero imports so this file
// loads identically under Deno and Jest, like parse.ts. Removes the need to
// hand-maintain currency names/symbols for the currency picker -- verified
// live 2026-09-24 that /v2/currencies returns an array of
// { iso_code, iso_numeric, name, symbol, start_date, end_date }.
export const FRANKFURTER_V2_CURRENCIES_URL = 'https://api.frankfurter.dev/v2/currencies';

export interface CurrencyMeta {
  code: string;
  isoNumeric: string | null;
  name: string;
  symbol: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface FrankfurterCurrencyEntry {
  iso_code?: unknown;
  iso_numeric?: unknown;
  name?: unknown;
  symbol?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

function toCurrencyMeta(entry: unknown, label: string): CurrencyMeta {
  if (entry === null || typeof entry !== 'object') {
    throw new Error(`Frankfurter currency entry ${label} is not an object`);
  }
  const { iso_code, iso_numeric, name, symbol, start_date, end_date } = entry as FrankfurterCurrencyEntry;

  if (typeof iso_code !== 'string' || !CURRENCY_RE.test(iso_code)) {
    throw new Error(`Frankfurter currency entry ${label} has an invalid iso_code: ${String(iso_code)}`);
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Frankfurter currency entry ${iso_code} has no name`);
  }

  return {
    code: iso_code,
    isoNumeric: typeof iso_numeric === 'string' ? iso_numeric : null,
    name,
    symbol: typeof symbol === 'string' ? symbol : null,
    startDate: typeof start_date === 'string' ? start_date : null,
    endDate: typeof end_date === 'string' ? end_date : null,
  };
}

export function parseFrankfurterCurrencies(json: unknown): CurrencyMeta[] {
  if (Array.isArray(json)) {
    return json.map((entry, index) => toCurrencyMeta(entry, `at index ${index}`));
  }
  // Defensive fallback: accept an object keyed by code too, in case the
  // live shape changes -- this endpoint is unversioned beyond the /v2 path
  // segment, and the live probe this session confirmed an array.
  if (json !== null && typeof json === 'object') {
    return Object.entries(json as Record<string, unknown>).map(([code, entry]) => toCurrencyMeta(entry, code));
  }
  throw new Error('Frankfurter currencies response is neither an array nor an object');
}
