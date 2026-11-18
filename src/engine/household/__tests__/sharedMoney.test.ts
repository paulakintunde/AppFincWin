import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { sharedMoneyFor } from '../sharedMoney';

const weightsArb = fc
  .array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 6 })
  .filter((w) => w.some((x) => x > 0));
const totalArb = fc.integer({ min: 0, max: 10_000_000_000 });

describe('sharedMoneyFor', () => {
  it('splits 10,001 by 60/40 with the odd unit to the larger remainder', () => {
    expect(sharedMoneyFor(minorUnits(10001), [60, 40], 0)).toBe(6001);
    expect(sharedMoneyFor(minorUnits(10001), [60, 40], 1)).toBe(4000);
  });

  it('gives a zero-weight member nothing', () => {
    expect(sharedMoneyFor(minorUnits(5000), [1, 0], 1)).toBe(0);
  });

  it('slices always add up to the shared total (SC8)', () => {
    fc.assert(
      fc.property(totalArb, weightsArb, (total, weights) => {
        const sum = weights.reduce((s, _w, i) => s + sharedMoneyFor(minorUnits(total), weights, i), 0);
        expect(sum).toBe(total);
      }),
    );
  });

  it('no member slice is more than the total, and none is negative', () => {
    fc.assert(
      fc.property(totalArb, weightsArb, (total, weights) => {
        weights.forEach((_w, i) => {
          const slice = sharedMoneyFor(minorUnits(total), weights, i);
          expect(slice).toBeGreaterThanOrEqual(0);
          expect(slice).toBeLessThanOrEqual(total);
        });
      }),
    );
  });

  it('rejects an index outside the list', () => {
    expect(() => sharedMoneyFor(minorUnits(100), [1, 1], 2)).toThrow(RangeError);
    expect(() => sharedMoneyFor(minorUnits(100), [1, 1], -1)).toThrow(RangeError);
    expect(() => sharedMoneyFor(minorUnits(100), [1, 1], 0.5)).toThrow(RangeError);
  });

  it('rejects weights that are all zero', () => {
    expect(() => sharedMoneyFor(minorUnits(100), [0, 0], 0)).toThrow(RangeError);
  });
});
