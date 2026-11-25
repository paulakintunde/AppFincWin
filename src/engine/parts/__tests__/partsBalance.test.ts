import { partsBalance } from '../partsBalance';
import { primaryCategory } from '../primaryCategory';

describe('partsBalance', () => {
  it('left, empty field counts as 0', () =>
    expect(partsBalance(5000, [3000, null])).toEqual({ state: 'left', amount: 2000 }));
  it('over', () => expect(partsBalance(5000, [3000, 2500])).toEqual({ state: 'over', amount: 500 }));
  it('adds up', () => expect(partsBalance(5000, [2000, 3000])).toEqual({ state: 'addsUp', amount: 0 }));
  it('works on magnitudes for negative totals', () => {
    expect(partsBalance(-5000, [-3000, null])).toEqual({ state: 'left', amount: 2000 });
    expect(partsBalance(-5000, [-3000, -2500])).toEqual({ state: 'over', amount: 500 });
  });
});

describe('primaryCategory', () => {
  const part = (categoryId: string | null, amount: number) => ({ categoryId, amount });
  it('picks the largest, ties to the lowest index', () => {
    expect(primaryCategory([part('A', -100), part('B', -300), part('C', -300)])).toBe('B');
  });
  it('returns null for a null-category winner', () => {
    expect(primaryCategory([part(null, -300), part('B', -100)])).toBeNull();
  });
  it('returns null for no parts', () => expect(primaryCategory([])).toBeNull());
});
