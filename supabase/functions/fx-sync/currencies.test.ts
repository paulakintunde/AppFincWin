import { DISCONTINUED_AFTER_DAYS, FRANKFURTER_V2_CURRENCIES_URL, parseFrankfurterCurrencies, type CurrencyMeta } from './currencies';

// Verbatim shape from the live Frankfurter v2 probe recorded in
// 01-08-PLAN.md (GET https://api.frankfurter.dev/v2/currencies).
const FIXTURE = [
  { iso_code: 'AED', iso_numeric: '784', name: 'United Arab Emirates Dirham', symbol: 'د.إ', start_date: '1996-04-11', end_date: '2026-09-24' },
  { iso_code: 'USD', iso_numeric: '840', name: 'United States Dollar', symbol: '$', start_date: '1792-01-01', end_date: '2026-09-24' },
];

const SYNC_DATE = '2026-09-24';

describe('parseFrankfurterCurrencies', () => {
  it('pins the v2 currencies endpoint', () => {
    expect(FRANKFURTER_V2_CURRENCIES_URL).toBe('https://api.frankfurter.dev/v2/currencies');
  });

  it('maps an array of entries to CurrencyMeta', () => {
    const rows = parseFrankfurterCurrencies(FIXTURE, SYNC_DATE);
    expect(rows).toEqual<CurrencyMeta[]>([
      { code: 'AED', isoNumeric: '784', name: 'United Arab Emirates Dirham', symbol: 'د.إ', startDate: '1996-04-11', endDate: null },
      { code: 'USD', isoNumeric: '840', name: 'United States Dollar', symbol: '$', startDate: '1792-01-01', endDate: null },
    ]);
  });

  it('accepts an object keyed by code as a defensive fallback (live endpoint verified as an array, but this endpoint is unversioned beyond /v2)', () => {
    const keyed = { USD: FIXTURE[1] };
    const rows = parseFrankfurterCurrencies(keyed, SYNC_DATE);
    expect(rows).toEqual<CurrencyMeta[]>([
      { code: 'USD', isoNumeric: '840', name: 'United States Dollar', symbol: '$', startDate: '1792-01-01', endDate: null },
    ]);
  });

  it('rejects a malformed currency code', () => {
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], iso_code: 'usd' }], SYNC_DATE)).toThrow(/invalid iso_code/);
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], iso_code: 'US' }], SYNC_DATE)).toThrow(/invalid iso_code/);
  });

  it('rejects an entry with no name', () => {
    expect(() => parseFrankfurterCurrencies([{ ...FIXTURE[1], name: '' }], SYNC_DATE)).toThrow(/no name/);
  });

  it('rejects a response that is neither an array nor an object', () => {
    expect(() => parseFrankfurterCurrencies('nope', SYNC_DATE)).toThrow(/neither an array nor an object/);
    expect(() => parseFrankfurterCurrencies(null, SYNC_DATE)).toThrow(/neither an array nor an object/);
  });
});

// Frankfurter v2 reports end_date as the latest date with data for ACTIVE
// currencies too (seen 2026-10-07), so end_date only means "discontinued"
// (D-08) when it is well behind the sync date.
describe('parseFrankfurterCurrencies end_date (discontinued vs active)', () => {
  const SYNC = '2026-10-07';
  const withEnd = (end_date: unknown) => {
    const entry: Record<string, unknown> = { ...FIXTURE[1] };
    if (end_date === undefined) delete entry.end_date;
    else entry.end_date = end_date;
    return parseFrankfurterCurrencies([entry], SYNC)[0].endDate;
  };

  it('pins the threshold at 30 days', () => {
    expect(DISCONTINUED_AFTER_DAYS).toBe(30);
  });

  it('treats an end_date equal to the sync date as active', () => {
    expect(withEnd('2026-10-07')).toBeNull();
  });

  it('treats yesterday as active', () => {
    expect(withEnd('2026-10-06')).toBeNull();
  });

  it('treats 29 days old as active', () => {
    expect(withEnd('2026-09-08')).toBeNull();
  });

  it('treats exactly 30 days old as active (discontinued only when MORE than 30 days)', () => {
    expect(withEnd('2026-09-07')).toBeNull();
  });

  it('treats 31 days old as discontinued and keeps the date', () => {
    expect(withEnd('2026-09-06')).toBe('2026-09-06');
  });

  it('keeps a long-discontinued end_date', () => {
    expect(withEnd('2021-01-01')).toBe('2021-01-01');
  });

  it('maps a missing end_date to null', () => {
    expect(withEnd(undefined)).toBeNull();
  });

  it('maps an unparseable end_date to null rather than throwing or discontinuing', () => {
    expect(withEnd('not-a-date')).toBeNull();
  });
});
