import { FRANKFURTER_V2_CURRENCIES_URL, parseFrankfurterCurrencies, type CurrencyMeta } from './currencies';

// Verbatim shape from the live Frankfurter v2 probe recorded in
// 01-08-PLAN.md (GET https://api.frankfurter.dev/v2/currencies).
const FIXTURE = [
  { iso_code: 'AED', iso_numeric: '784', name: 'United Arab Emirates Dirham', symbol: 'د.إ', start_date: '1996-04-11', end_date: '2026-09-24' },
  { iso_code: 'USD', iso_numeric: '840', name: 'United States Dollar', symbol: '$', start_date: '1792-01-01', end_date: '2026-09-24' },
];

describe('parseFrankfurterCurrencies', () => {
  it('pins the v2 currencies endpoint', () => {
    expect(FRANKFURTER_V2_CURRENCIES_URL).toBe('https://api.frankfurter.dev/v2/currencies');
  });

  it('maps an array of entries to CurrencyMeta', () => {
    const rows = parseFrankfurterCurrencies(FIXTURE);
    expect(rows).toEqual<CurrencyMeta[]>([
      { code: 'AED', isoNumeric: '784', name: 'United Arab Emirates Dirham', symbol: 'د.إ', startDate: '1996-04-11', endDate: '2026-09-24' },
      { code: 'USD', isoNumeric: '840', name: 'United States Dollar', symbol: '$', startDate: '1792-01-01', endDate: '2026-09-24' },
    ]);
  });

  it('accepts an object keyed by code as a defensive fallback (live endpoint verified as an array, but this endpoint is unversioned beyond /v2)', () => {
    const keyed = { USD: FIXTURE[1] };
    const rows = parseFrankfurterCurrencies(keyed);
    expect(rows).toEqual<CurrencyMeta[]>([
      { code: 'USD', isoNumeric: '840', name: 'United States Dollar', symbol: '$', startDate: '1792-01-01', endDate: '2026-09-24' },
    ]);
  });

  it('rejects a malformed currency code', () => {
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], iso_code: 'usd' }])).toThrow(/invalid iso_code/);
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], iso_code: 'US' }])).toThrow(/invalid iso_code/);
  });

  it('rejects an entry with no name', () => {
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], name: '' }])).toThrow(/no name/);
  });

  it('rejects a response that is neither an array nor an object', () => {
    expect(() => parseFrankfurterCurrencies('nope')).toThrow(/neither an array nor an object/);
    expect(() => parseFrankfurterCurrencies(null)).toThrow(/neither an array nor an object/);
  });
});
