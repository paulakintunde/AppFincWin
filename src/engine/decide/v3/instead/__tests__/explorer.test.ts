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
} as unknown as MonthModel;

describe('explore', () => {
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

describe('largestPriceThatFits', () => {
  test('returns the bisect result unchanged', () => {
    expect(largestPriceThatFits(mu(1000), (p) => p <= 640)).toEqual({ kind: 'found', price: 640 });
    expect(largestPriceThatFits(mu(1000), () => true)).toEqual({ kind: 'full_price_fits', price: 1000 });
    expect(largestPriceThatFits(mu(1000), () => false)).toEqual({ kind: 'nothing_affordable' });
  });
});
