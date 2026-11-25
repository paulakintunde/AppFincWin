// 10.1-13 (D-16, D-20): items to category parts.
import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { allocateWithZeros } from '../../split/allocateWithZeros';
import { itemsToParts } from '../itemsToParts';

const base = { lineSign: -1 as const, lineCategoryId: 'G', tax: 0, tip: 0, discounts: 0 };

describe('10.1-13 itemsToParts', () => {
  it('groups by category in first-appearance order and adds a Tax and tip part on the line category', () => {
    const p = itemsToParts({ ...base, tax: 166, items: [{ price: 1000, discount: 0, categoryId: 'G' }, { price: 500, discount: 0, categoryId: 'G' }, { price: 700, discount: 0, categoryId: 'H' }] });
    expect(p).toEqual([{ categoryId: 'G', amount: -1500 }, { categoryId: 'H', amount: -700 }, { categoryId: 'G', amount: -166, label: 'taxTip' }]);
  });
  it('item discounts reduce the item; receipt discounts spread over net by largest remainder', () => {
    const p = itemsToParts({ ...base, discounts: 100, items: [{ price: 1000, discount: 200, categoryId: 'G' }, { price: 700, discount: 0, categoryId: 'H' }] })!;
    const [a, b] = allocateWithZeros(minorUnits(100), [800, 700]);
    expect(p.map((x) => x.amount)).toEqual([-(800 - a!), -(700 - b!)]);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBe(-1400);
    expect(p.some((x) => x.label === 'taxTip')).toBe(false);
  });
  it('returns null for a single part; a taxTip category overrides the line category', () => {
    expect(itemsToParts({ ...base, items: [{ price: 100, discount: 0, categoryId: 'G' }, { price: 50, discount: 0, categoryId: 'G' }] })).toBeNull();
    const p = itemsToParts({ ...base, tip: 30, taxTipCategoryId: 'T', items: [{ price: 100, discount: 0, categoryId: 'G' }] })!;
    expect(p[1]).toEqual({ categoryId: 'T', amount: -30, label: 'taxTip' });
  });
  it('drops zero groups and keeps the sign for income lines; discounts with nothing to spread over change nothing', () => {
    const p = itemsToParts({ ...base, lineSign: 1, tax: 10, items: [{ price: 100, discount: 100, categoryId: 'A' }, { price: 50, discount: 0, categoryId: 'B' }] })!;
    expect(p).toEqual([{ categoryId: 'B', amount: 50 }, { categoryId: 'G', amount: 10, label: 'taxTip' }]);
    expect(itemsToParts({ ...base, discounts: 5, items: [{ price: 100, discount: 100, categoryId: 'A' }] })).toBeNull();
  });
  it('property: parts sum to sign * (net - discounts + tax + tip)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ price: fc.integer({ min: 1, max: 5000 }), d: fc.nat(100), categoryId: fc.constantFrom<string | null>('A', 'B', null) }), { minLength: 1, maxLength: 6 }),
        fc.nat(500), fc.nat(500), fc.nat(300), fc.constantFrom<1 | -1>(1, -1),
        (rows, tax, tip, disc, lineSign) => {
          const items = rows.map((r) => ({ price: r.price, discount: Math.min(r.d, r.price - 1), categoryId: r.categoryId }));
          const net = items.reduce((s, x) => s + x.price - x.discount, 0);
          const discounts = Math.min(disc, net);
          const parts = itemsToParts({ lineSign, lineCategoryId: 'G', items, tax, tip, discounts });
          if (parts === null) return true;
          return parts.reduce((s, x) => s + x.amount, 0) === lineSign * (net - discounts + tax + tip);
        },
      ),
    );
  });
});
