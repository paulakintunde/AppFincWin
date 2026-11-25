import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { allocateWithZeros } from '../allocateWithZeros';

// Parity table: supabase pgTAP file 131 reuses these cases against hh_allocate.
const PARITY_CASES: ReadonlyArray<{ total: number; weights: number[]; expected: number[] }> = [
  { total: 100, weights: [0, 1, 1], expected: [0, 50, 50] },
  { total: 101, weights: [1, 0, 1], expected: [51, 0, 50] },
  { total: -101, weights: [1, 0, 1], expected: [-51, 0, -50] },
  { total: 1, weights: [0, 1, 1, 1], expected: [0, 1, 0, 0] },
  { total: 0, weights: [0, 3], expected: [0, 0] },
];

describe('allocateWithZeros', () => {
  it.each(PARITY_CASES)('allocates $total over $weights', ({ total, weights, expected }) => {
    expect(allocateWithZeros(minorUnits(total), weights)).toEqual(expected);
  });

  it('throws RangeError when every weight is zero', () => {
    expect(() => allocateWithZeros(minorUnits(10), [0, 0])).toThrow(RangeError);
    expect(() => allocateWithZeros(minorUnits(10), [])).toThrow('all weights are zero');
  });

  it('throws RangeError on a negative weight', () => {
    expect(() => allocateWithZeros(minorUnits(10), [1, -1])).toThrow(RangeError);
  });

  it('sums to the total and gives zero weights zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc
          .array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 })
          .filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const out = allocateWithZeros(minorUnits(total), weights);
          expect(out.reduce((s, x) => s + x, 0)).toBe(total);
          weights.forEach((w, i) => {
            if (w === 0) expect(out[i]).toBe(0);
          });
        },
      ),
    );
  });
});
