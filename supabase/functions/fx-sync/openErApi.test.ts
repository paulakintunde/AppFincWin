import { OPEN_ER_API_URL, OPEN_ER_API_ATTRIBUTION, OPEN_ER_API_ATTRIBUTION_URL, parseOpenErApiRates } from './openErApi';
import type { FxRow } from './parse';

// Verbatim shape from the live open.er-api probe recorded in 01-08-PLAN.md
// (GET https://open.er-api.com/v6/latest/EUR), trimmed to a few currencies.
const FIXTURE = {
  result: 'success',
  provider: 'https://www.exchangerate-api.com',
  documentation: 'https://www.exchangerate-api.com/docs/free',
  terms_of_use: 'https://www.exchangerate-api.com/terms',
  time_last_update_unix: 1790208152,
  time_last_update_utc: 'Thu, 24 Sep 2026 00:02:31 +0000',
  time_next_update_unix: 1790296062,
  time_next_update_utc: 'Fri, 25 Sep 2026 00:27:42 +0000',
  time_eol_unix: 0,
  base_code: 'EUR',
  rates: { EUR: 1, USD: 1.1483, JPY: 180.7 },
};

describe('parseOpenErApiRates', () => {
  it('pins the v6 latest endpoint', () => {
    expect(OPEN_ER_API_URL).toBe('https://open.er-api.com/v6/latest');
  });

  it('carries the exact required attribution text, not a paraphrase', () => {
    expect(OPEN_ER_API_ATTRIBUTION).toBe('Rates By Exchange Rate API');
    expect(OPEN_ER_API_ATTRIBUTION_URL).toBe('https://www.exchangerate-api.com');
  });

  it('maps every rate except the base itself, dated from time_last_update_utc', () => {
    const rows = parseOpenErApiRates(FIXTURE);
    expect(rows).toEqual<FxRow[]>([
      { base: 'EUR', quote: 'USD', rate: '1.1483', date: '2026-09-24' },
      { base: 'EUR', quote: 'JPY', rate: '180.7', date: '2026-09-24' },
    ]);
  });

  it('throws when result is not success', () => {
    expect(() => parseOpenErApiRates({ ...FIXTURE, result: 'error' })).toThrow(/result=error/);
  });

  it('throws when base_code is not EUR -- the project stores EUR-based rates only', () => {
    expect(() => parseOpenErApiRates({ ...FIXTURE, base_code: 'USD' })).toThrow(/base_code/);
  });

  it('throws on an unparsable time_last_update_utc', () => {
    expect(() => parseOpenErApiRates({ ...FIXTURE, time_last_update_utc: 'not a date' })).toThrow(/unparsable/);
  });

  it('throws on a non-finite or non-positive rate', () => {
    expect(() => parseOpenErApiRates({ ...FIXTURE, rates: { EUR: 1, USD: Infinity } })).toThrow(/invalid/);
    expect(() => parseOpenErApiRates({ ...FIXTURE, rates: { EUR: 1, USD: 0 } })).toThrow(/invalid/);
    expect(() => parseOpenErApiRates({ ...FIXTURE, rates: { EUR: 1, USD: -1 } })).toThrow(/invalid/);
  });

  it('throws on a lowercase currency code, matching parse.ts strictness (never silently skipped)', () => {
    expect(() => parseOpenErApiRates({ ...FIXTURE, rates: { EUR: 1, usd: 1.1 } })).toThrow(/not a valid ISO/);
  });

  it('throws on a response that is not an object', () => {
    expect(() => parseOpenErApiRates(null)).toThrow(/not an object/);
    expect(() => parseOpenErApiRates('nope')).toThrow(/not an object/);
  });
});
