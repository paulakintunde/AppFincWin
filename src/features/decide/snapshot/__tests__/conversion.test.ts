import type { FxLatestRow } from '@/db/rows';
import { makeConverter } from '../conversion';
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
