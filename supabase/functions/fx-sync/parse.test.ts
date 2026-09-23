import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates, type FxRow } from './parse';

// Verbatim fixture from the live Frankfurter v2 probe recorded in
// 00-09-PLAN.md (GET .../v2/rates?base=EUR&quotes=USD,NGN,JPY).
const V2_FIXTURE = [
  { date: '2026-09-22', base: 'EUR', quote: 'JPY', rate: 180.7 },
  { date: '2026-09-22', base: 'EUR', quote: 'NGN', rate: 1526.71 },
  { date: '2026-09-22', base: 'EUR', quote: 'USD', rate: 1.1483 },
];

// The v1 shape this project must reject.
const V1_FIXTURE = { amount: 1.0, base: 'EUR', date: '2026-09-22', rates: { USD: 1.14 } };

describe('parseFrankfurterRates', () => {
  it('pins the v2 endpoint, not v1', () => {
    expect(FRANKFURTER_V2_RATES_URL).toBe('https://api.frankfurter.dev/v2/rates');
  });

  it('maps every v2 entry to a row with the rate kept as a decimal string', () => {
    const rows = parseFrankfurterRates(V2_FIXTURE);
    expect(rows).toEqual<FxRow[]>([
      { base: 'EUR', quote: 'JPY', rate: '180.7', date: '2026-09-22' },
      { base: 'EUR', quote: 'NGN', rate: '1526.71', date: '2026-09-22' },
      { base: 'EUR', quote: 'USD', rate: '1.1483', date: '2026-09-22' },
    ]);
    expect(rows[0].rate).toBe(String(180.7));
  });

  it('rejects the v1 object shape', () => {
    expect(() => parseFrankfurterRates(V1_FIXTURE)).toThrow('v1 response shape');
  });

  it('rejects an empty array', () => {
    expect(() => parseFrankfurterRates([])).toThrow('no rates');
  });

  it('rejects a non-ISO date, naming the offending index', () => {
    expect(() =>
      parseFrankfurterRates([{ date: '22-09-2026', base: 'EUR', quote: 'USD', rate: 1.1 }])
    ).toThrow(/index 0/);
  });

  it('rejects a lowercase currency code', () => {
    expect(() =>
      parseFrankfurterRates([{ date: '2026-09-22', base: 'eur', quote: 'USD', rate: 1.1 }])
    ).toThrow(/index 0/);
  });

  it('rejects a 2-letter currency code', () => {
    expect(() =>
      parseFrankfurterRates([{ date: '2026-09-22', base: 'EU', quote: 'USD', rate: 1.1 }])
    ).toThrow(/index 0/);
  });

  it('rejects a rate that is zero or negative', () => {
    expect(() =>
      parseFrankfurterRates([{ date: '2026-09-22', base: 'EUR', quote: 'USD', rate: 0 }])
    ).toThrow(/index 0/);
    expect(() =>
      parseFrankfurterRates([{ date: '2026-09-22', base: 'EUR', quote: 'USD', rate: -1 }])
    ).toThrow(/index 0/);
  });

  it('rejects a non-finite rate', () => {
    expect(() =>
      parseFrankfurterRates([{ date: '2026-09-22', base: 'EUR', quote: 'USD', rate: Infinity }])
    ).toThrow(/index 0/);
  });

  it('skips an entry where base === quote rather than throwing', () => {
    const rows = parseFrankfurterRates([
      { date: '2026-09-22', base: 'EUR', quote: 'EUR', rate: 1 },
      { date: '2026-09-22', base: 'EUR', quote: 'USD', rate: 1.1 },
    ]);
    expect(rows).toEqual([{ base: 'EUR', quote: 'USD', rate: '1.1', date: '2026-09-22' }]);
  });
});
