import fc from 'fast-check';
import { scaleParts } from '../scaleParts';

const line = (amount: number, parts: { categoryId: string | null; amount: number }[] | null) => ({
  id: 'l',
  amount,
  categoryId: 'g',
  parts,
});
const amounts = (rows: { amount: number }[]) => rows.map((r) => r.amount);
const AB = [
  { categoryId: 'A', amount: -3000 },
  { categoryId: 'B', amount: -2000 },
];

describe('scaleParts', () => {
  it('unsplit gives one row with the target', () => {
    expect(amounts(scaleParts(line(-5000, null), -6250))).toEqual([-6250]);
  });
  it('scales two parts', () => {
    expect(amounts(scaleParts(line(-5000, AB), -6250))).toEqual([-3750, -2500]);
  });
  it('largest remainder, tie to lowest index', () => {
    expect(amounts(scaleParts(line(-5000, AB), -1))).toEqual([-1, 0]);
  });
  it('places a left gap proportionally', () => {
    const rows = scaleParts(
      line(-5000, [
        { categoryId: 'A', amount: -2000 },
        { categoryId: 'B', amount: -2000 },
      ]),
      -500,
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]!.isGap).toBe(true);
    expect(amounts(rows).reduce((s, x) => s + x, 0)).toBe(-500);
  });
  it('drops an over gap', () => {
    const rows = scaleParts(
      line(-4000, [
        { categoryId: 'A', amount: -3000 },
        { categoryId: 'B', amount: -1500 },
      ]),
      -2000,
    );
    expect(rows).toHaveLength(2);
    expect(amounts(rows).reduce((s, x) => s + x, 0)).toBe(-2000);
  });
  it('zero weights everywhere puts the target on the first row', () => {
    const zero = [
      { categoryId: 'A', amount: 0 },
      { categoryId: 'B', amount: 0 },
    ];
    expect(amounts(scaleParts(line(0, zero), 7))).toEqual([7, 0]);
  });
  it('sums to any target (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.array(fc.integer({ min: 1, max: 1e6 }), { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 0, max: 1e6 }),
        (target, mags, short) => {
          const parts = mags.map((m, i) => ({ categoryId: `c${i}`, amount: -m }));
          const total = -(mags.reduce((s, m) => s + m, 0) + short);
          const rows = scaleParts(line(total, parts), target);
          expect(amounts(rows).reduce((s, x) => s + x, 0)).toBe(target);
        },
      ),
    );
  });
});
