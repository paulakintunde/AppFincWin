import fc from 'fast-check';
import { expandParts } from '../expandParts';

const base = { id: 'l1', categoryId: 'groceries' };

describe('expandParts', () => {
  it('expands an unsplit line to one row with its own category', () => {
    expect(expandParts({ ...base, amount: -5000, parts: null })).toEqual([
      { lineId: 'l1', categoryId: 'groceries', amount: -5000, isGap: false, label: null },
    ]);
  });

  it('treats a single part as unsplit', () => {
    const rows = expandParts({ ...base, amount: -5000, parts: [{ categoryId: 'x', amount: -5000 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.categoryId).toBe('groceries');
  });

  it('expands two parts that add up with no gap, keeping labels', () => {
    const rows = expandParts({
      ...base,
      amount: -5000,
      parts: [
        { categoryId: 'groceries', amount: -3000 },
        { categoryId: 'household', amount: -2000, label: 'taxTip' },
      ],
    });
    expect(rows.map((r) => [r.categoryId, r.amount, r.isGap, r.label])).toEqual([
      ['groceries', -3000, false, null],
      ['household', -2000, false, 'taxTip'],
    ]);
  });

  it('adds an Uncategorised gap row when parts fall short', () => {
    const rows = expandParts({
      ...base,
      amount: -5000,
      parts: [
        { categoryId: 'a', amount: -3000 },
        { categoryId: 'b', amount: -1500 },
      ],
    });
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ lineId: 'l1', categoryId: null, amount: -500, isGap: true, label: null });
  });

  it('gives an opposite-sign gap after the total is edited down', () => {
    const rows = expandParts({
      ...base,
      amount: -4000,
      parts: [
        { categoryId: 'a', amount: -3000 },
        { categoryId: 'b', amount: -1500, label: null },
      ],
    });
    expect(rows[2]).toMatchObject({ amount: 500, isGap: true, categoryId: null });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(-4000);
  });

  it('always sums to the total (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }).filter((n) => n !== 0),
        fc.array(fc.integer({ min: 1, max: 1e8 }), { minLength: 2, maxLength: 20 }),
        (total, mags) => {
          const sign = total < 0 ? -1 : 1;
          const parts = mags.map((m, i) => ({ categoryId: `c${i}`, amount: sign * m }));
          const rows = expandParts({ id: 'l', amount: total, categoryId: null, parts });
          expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(total);
        },
      ),
    );
  });
});
