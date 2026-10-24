import type { FxLatestRow } from '@/db/rows';
import { convertFloored, makeConverter } from '../conversion';
import { CAD_RATE, USD_RATE, customCurrency } from './helpers/sourceFixtures';

const GBP_RATE: FxLatestRow = { quote: 'GBP', rate: '0.85', rate_date: '2026-10-12', source: 'open-er-api' };
const make = (rates: readonly FxLatestRow[] = [USD_RATE, CAD_RATE, GBP_RATE], customs = [customCurrency()]) =>
  makeConverter({ home: 'USD', rates, customs, today: '2026-10-15' });

describe('makeConverter', () => {
  it('WR-B01: zero in a currency with no stored rate is 0 and adds no note', () => {
    const c = make([USD_RATE]);
    expect(c.toHome(0, 'JPY')).toBe(0);
    expect(c.toHome(0, 'EUR')).toBe(0);
    expect(c.notes()).toEqual([]);
    expect(c.unconverted()).toBeNull();
  });

  it('returns the amount unchanged for the home currency and adds no note', () => {
    const c = make();
    expect(c.toHome(1234, 'USD')).toBe(1234);
    expect(c.notes()).toEqual([]);
    expect(c.unconverted()).toBeNull();
  });

  it('converts a foreign amount at the latest stored rate and notes the currency once', () => {
    const c = make();
    expect(c.toHome(10_000, 'EUR')).toBe(11_000);
    expect(c.toHome(20_000, 'EUR')).toBe(22_000);
    expect(c.notes()).toEqual([{ currency: 'EUR', rateText: '1.1000000000', rateDate: '2026-10-14' }]);
  });

  it('sorts notes by currency', () => {
    const c = make();
    c.toHome(100, 'GBP');
    c.toHome(100, 'EUR');
    c.toHome(100, 'CAD');
    expect(c.notes().map((n) => n.currency)).toEqual(['CAD', 'EUR', 'GBP']);
  });

  it('returns null for a missing rate and records the currency only when told', () => {
    const c = make([USD_RATE]);
    expect(c.toHome(100, 'JPY')).toBeNull();
    expect(c.unconverted()).toBeNull();
    c.miss('JPY');
    c.miss('JPY');
    c.miss('CHF');
    expect(c.unconverted()).toEqual({ currencies: ['CHF', 'JPY'], rowCount: 3 });
    expect(c.notes()).toEqual([]);
  });

  it('converts a custom currency through its reference', () => {
    const c = make();
    expect(c.toHome(1_000, 'TOK')).toBe(500);
    expect(c.notes()[0]?.currency).toBe('TOK');
  });

  it('D-69: counts each provisional line once and keeps the earliest rate date', () => {
    const c = make();
    expect(c.provisionalNote()).toBeNull();
    c.provisional('r1', '2026-10-14');
    c.provisional('r1', '2026-10-01');
    c.provisional('r2', '2026-10-13');
    c.provisional('r3', '2026-10-14');
    expect(c.provisionalNote()).toEqual({ rowCount: 3, rateDate: '2026-10-13' });
    expect(c.unconverted()).toBeNull();
    expect(c.notes()).toEqual([]);
  });
});

describe('convertFloored (D-91)', () => {
  const TODAY = '2026-10-15';
  const customs = (over: Parameters<typeof customCurrency>[0]) => [customCurrency(over)];

  it('D-91 floors where a half-up conversion rounds up', () => {
    // 10,000,000 USD cents at 1.3 USD per EUR = 7,692,307.69... EUR cents: half-up gives ...308, the floor ...307
    const rates: FxLatestRow[] = [{ ...USD_RATE, rate: '1.3' }];
    expect(convertFloored(10_000_000, 'USD', 'EUR', rates, [], TODAY)).toEqual({ amount: 7_692_307, rateDate: '2026-10-14' });
  });

  it('is the amount itself, dated today, when the currencies match', () => {
    expect(convertFloored(10_000_000, 'USD', 'USD', [], [], TODAY)).toEqual({ amount: 10_000_000, rateDate: TODAY });
  });

  it('is null when either leg has no stored rate', () => {
    expect(convertFloored(10_000_000, 'USD', 'EUR', [], [], TODAY)).toBeNull();
    expect(convertFloored(10_000_000, 'USD', 'GBP', [USD_RATE], [], TODAY)).toBeNull();
  });

  it('converts into a custom currency through its unit value, exactly', () => {
    // 1 TOK = 0.5 USD, 2 decimals: 10,000,000 USD cents = 20,000,000 TOK cents
    expect(convertFloored(10_000_000, 'USD', 'TOK', [USD_RATE], [customCurrency()], TODAY)).toEqual({ amount: 20_000_000, rateDate: '2026-10-10' });
  });

  it('converts from a custom leg and honours its decimals', () => {
    const from = customs({ code: 'USD', reference_currency: 'EUR', unit_value: '1.2', decimals: 2, as_of: '2026-10-09' });
    expect(convertFloored(10_000_000, 'USD', 'EUR', [], from, TODAY)).toEqual({ amount: 12_000_000, rateDate: '2026-10-09' });
  });

  it('is null instead of throwing on an unusable exponent', () => {
    expect(convertFloored(10_000_000, 'USD', 'TOK', [USD_RATE], customs({ decimals: 9 }), TODAY)).toBeNull();
  });

  it('is null when the result is beyond a safe integer', () => {
    expect(convertFloored(10_000_000, 'USD', 'TOK', [USD_RATE], customs({ unit_value: '0.0000000001' }), TODAY)).toBeNull();
  });
});
