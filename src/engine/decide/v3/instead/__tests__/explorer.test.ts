import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import type { MonthModel } from '../../types';
import { explore, largestPriceThatFits } from '../explorer';
import { buyLater } from '../futures';

const mu = minorUnits;
const month = {
  month: '2026-10',
  typicalLeft: mu(42500),
  recurringBills: mu(120000),
  setAside: mu(30000),
  billsDue: mu(80000),
  e: mu(40000),
} as unknown as MonthModel;

describe('explore', () => {
  test('L-04 everydayCut is clamped to E and sets clamped', () => {
    const r = explore({ month, flexibleSaving: mu(0), levers: { everydayCut: mu(999999), flexibleSavingCut: mu(0) }, price: mu(1000), unspent: mu(0) });
    expect(r.typicalLeft).toBe(82500);
    expect(r.clamped).toBe(true);
  });

  test('L-04 unknown E gives no everyday lever', () => {
    const noE = { ...month, e: null } as unknown as MonthModel;
    const r = explore({ month: noE, flexibleSaving: mu(0), levers: { everydayCut: mu(500), flexibleSavingCut: mu(0) }, price: mu(1000), unspent: mu(0) });
    expect(r.typicalLeft).toBe(42500);
    expect(r.clamped).toBe(true);
  });

  test('everydayCut raises typicalLeft by exactly the cut and moves buyLater earlier or equal', () => {
    const base = explore({
      month,
      flexibleSaving: mu(0),
      levers: { everydayCut: mu(0), flexibleSavingCut: mu(0) },
      price: mu(300000),
      unspent: mu(0),
    });
    const cut = explore({
      month,
      flexibleSaving: mu(0),
      levers: { everydayCut: mu(10000), flexibleSavingCut: mu(0) },
      price: mu(300000),
      unspent: mu(0),
    });
    expect(cut.typicalLeft).toBe(52500);
    expect(base.typicalLeft).toBe(42500);
    expect(cut.buyLater.months!).toBeLessThanOrEqual(base.buyLater.months!);
  });

  test('flexibleSavingCut is clamped to the flexible saving, with a flag', () => {
    const r = explore({
      month,
      flexibleSaving: mu(5000),
      levers: { everydayCut: mu(0), flexibleSavingCut: mu(9000) },
      price: mu(1000),
      unspent: mu(0),
    });
    expect(r.typicalLeft).toBe(47500);
    expect(r.clamped).toBe(true);
  });

  test('I30 explorer limits: fixed commitments never change', () => {
    fc.assert(
      fc.property(fc.nat(500000), fc.nat(500000), fc.nat(500000), (e, s, f) => {
        const before = JSON.stringify(month);
        explore({
          month,
          flexibleSaving: mu(f),
          levers: { everydayCut: mu(e), flexibleSavingCut: mu(s) },
          price: mu(300000),
          unspent: mu(10000),
        });
        expect(JSON.stringify(month)).toBe(before);
        expect(month.recurringBills).toBe(120000);
        expect(month.setAside).toBe(30000);
      })
    );
  });

  test('unknown typicalLeft stays unknown', () => {
    const r = explore({
      month: { ...month, typicalLeft: null },
      flexibleSaving: mu(0),
      levers: { everydayCut: mu(100), flexibleSavingCut: mu(0) },
      price: mu(10),
      unspent: mu(0),
    });
    expect(r.typicalLeft).toBeNull();
    expect(r.buyLater).toEqual(buyLater({ price: mu(10), unspent: mu(0), typicalLeft: null, month: '2026-10' }));
  });

  test('rejects negative levers', () => {
    expect(() =>
      explore({ month, flexibleSaving: mu(0), levers: { everydayCut: mu(-1), flexibleSavingCut: mu(0) }, price: mu(1), unspent: null })
    ).toThrow(RangeError);
  });
});

describe('explore: a seasonal earner (D-12)', () => {
  // Last year, November to October: Nov..Apr 20,000 left each (December short), May..Sep 150,000.
  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(((10 + i) % 12) + 1).padStart(2, '0');
    const year = i < 2 ? '2025' : '2026';
    const busy = ['05', '06', '07', '08', '09'].includes(mm);
    return { month: `${year}-${mm}`, income: mu(0), everyday: mu(0), left: mu(busy ? 150_000 : mm === '12' ? -5_000 : 20_000), lean: !busy };
  });
  const seasonalMonth = {
    ...month,
    month: '2026-11',
    incomePicture: { treated: 'seasonal', months },
  } as unknown as MonthModel;
  const base = { month: seasonalMonth, flexibleSaving: mu(0), price: mu(300_000), unspent: mu(0) };

  test('D-12 at lever 0 it equals the futures buy later', () => {
    const r = explore({ ...base, levers: { everydayCut: mu(0), flexibleSavingCut: mu(0) } });
    const f = buyLater({ price: mu(300_000), unspent: mu(0), typicalLeft: mu(42_500), month: '2026-11', picture: { treated: 'seasonal', months } });
    expect(r.buyLater.readyBy).toBe(f.readyBy);
  });

  test('D-12 an everyday cut moves the seasonal date earlier', () => {
    const zero = explore({ ...base, levers: { everydayCut: mu(0), flexibleSavingCut: mu(0) } });
    const cut = explore({ ...base, levers: { everydayCut: mu(30_000), flexibleSavingCut: mu(0) } });
    expect(cut.buyLater.readyBy! < zero.buyLater.readyBy!).toBe(true);
  });
});

describe('largestPriceThatFits', () => {
  test('returns the bisect result unchanged', () => {
    expect(largestPriceThatFits(mu(1000), (p) => p <= 640)).toEqual({ kind: 'found', price: 640 });
    expect(largestPriceThatFits(mu(1000), () => true)).toEqual({ kind: 'full_price_fits', price: 1000 });
    expect(largestPriceThatFits(mu(1000), () => false)).toEqual({ kind: 'nothing_affordable' });
  });
});
