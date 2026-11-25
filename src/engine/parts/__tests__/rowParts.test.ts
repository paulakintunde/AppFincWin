// 10.1-09: line and row helpers.
import { amountInCategories, homeCategoryAmounts, partsMatch } from '../rowParts';
import { linePartAmounts, scaleLineParts } from '../lineParts';
import { minorUnits } from '../../money/types';

const mu = minorUnits;
const usd = { id: 'l1', amount: -5000, categoryId: 'A', parts: [{ categoryId: 'A', amount: -3000 }, { categoryId: 'B', amount: -2000 }] };
const gap = { id: 'l2', amount: 5000, categoryId: 'A', parts: [{ categoryId: 'G', amount: 3000 }, { categoryId: 'H', amount: 1500 }] };

describe('10.1-09 rowParts', () => {
  it('homeCategoryAmounts scales by largest remainder; null home gives null; unsplit gives one row', () => {
    expect(homeCategoryAmounts(usd, -6250)!.map((r) => [r.categoryId, r.amount])).toEqual([['A', -3750], ['B', -2500]]);
    expect(homeCategoryAmounts(usd, null)).toBeNull();
    expect(homeCategoryAmounts({ id: 'u', amount: -100, categoryId: 'A', parts: null }, -120)!.map((r) => r.amount)).toEqual([-120]);
  });
  it('partsMatch sees part categories and the gap as null', () => {
    expect(partsMatch(usd, ['B'])).toBe(true);
    expect(partsMatch(usd, ['C'])).toBe(false);
    expect(partsMatch(usd, [null])).toBe(false);
    expect(partsMatch(gap, [null])).toBe(true);
  });
  it('amountInCategories sums matching home-scaled rows', () => {
    expect(amountInCategories(usd, -6250, ['B'])).toBe(-2500);
    expect(amountInCategories(usd, -6250, ['A', 'B'])).toBe(-6250);
    expect(amountInCategories(usd, null, ['B'])).toBeNull();
  });
});

describe('10.1-09 lineParts', () => {
  it('linePartAmounts: unsplit is one row; split adds the gap under null', () => {
    expect(linePartAmounts({ id: 'u', amount: mu(5000), categoryId: 'G' })).toEqual([{ categoryId: 'G', amount: 5000 }]);
    expect(linePartAmounts({ id: 'g', amount: mu(5000), categoryId: null, parts: [{ categoryId: 'G', amount: mu(3000) }, { categoryId: 'H', amount: mu(1500) }] })).toEqual([
      { categoryId: 'G', amount: 3000 }, { categoryId: 'H', amount: 1500 }, { categoryId: null, amount: 500 },
    ]);
  });
  it('scaleLineParts: undefined without parts; keeps parts summing to the new amount', () => {
    expect(scaleLineParts({ id: 'u', amount: mu(5000), categoryId: 'G' }, 100)).toBeUndefined();
    expect(scaleLineParts({ id: 'u', amount: mu(5000), categoryId: 'G', parts: [{ categoryId: 'G', amount: mu(5000) }] }, 100)).toBeUndefined();
    const p = scaleLineParts({ id: 'g', amount: mu(5000), categoryId: null, parts: [{ categoryId: 'G', amount: mu(3000) }, { categoryId: 'H', amount: mu(2000) }] }, 1000)!;
    expect(p.map((x) => x.amount)).toEqual([600, 400]);
  });
});
