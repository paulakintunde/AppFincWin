import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { allocate } from '../allocate';

describe('allocate', () => {
  it('splits evenly with the remainder going to the earliest index', () => {
    expect(allocate(minorUnits(100), [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('is symmetric for negative totals', () => {
    expect(allocate(minorUnits(-100), [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('splits two ways with an odd remainder going to index 0', () => {
    expect(allocate(minorUnits(101), [1, 1])).toEqual([51, 50]);
  });

  it('breaks a full tie by ascending index', () => {
    expect(allocate(minorUnits(1), [1, 1, 1])).toEqual([1, 0, 0]);
  });

  it('splits by weight with no remainder tie', () => {
    expect(allocate(minorUnits(1000), [2, 1])).toEqual([667, 333]);
  });

  it('splits a zero total into all zeros', () => {
    expect(allocate(minorUnits(0), [3, 5])).toEqual([0, 0]);
  });

  it('splits exactly when weights divide evenly', () => {
    expect(allocate(minorUnits(10), [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('throws RangeError on an empty weights array', () => {
    expect(() => allocate(minorUnits(100), [])).toThrow(RangeError);
  });

  it('throws RangeError on a zero weight', () => {
    expect(() => allocate(minorUnits(100), [0, 1])).toThrow(RangeError);
  });

  it('throws RangeError on a non-integer weight', () => {
    expect(() => allocate(minorUnits(100), [1.5, 1])).toThrow(RangeError);
  });

  it('throws RangeError on a negative weight', () => {
    expect(() => allocate(minorUnits(100), [-1, 2])).toThrow(RangeError);
  });

  it('always sums exactly to the original total, matches the exact rational share within one unit, and is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 8 }),
        (total, weights) => {
          const shares = allocate(minorUnits(total), weights);
          const sumWeights = BigInt(weights.reduce((s, w) => s + w, 0));
          const sumShares = shares.reduce((s, x) => s + BigInt(x), 0n);
          expect(sumShares).toBe(BigInt(total));

          shares.forEach((share, i) => {
            const exactNumerator = BigInt(total) * BigInt(weights[i]!);
            const diff = BigInt(share) * sumWeights - exactNumerator;
            const absDiff = diff < 0n ? -diff : diff;
            expect(absDiff < sumWeights).toBe(true);
          });

          const shares2 = allocate(minorUnits(total), weights);
          expect(shares2).toEqual(shares);
        }
      )
    );
  });
});
