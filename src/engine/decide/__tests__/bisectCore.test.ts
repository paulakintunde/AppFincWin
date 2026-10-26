import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { bisectLargest } from '../bisectCore';

describe('bisectCore', () => {
  it('finds the exact threshold of a monotone predicate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 }), (upper, t0) => {
        const t = Math.min(t0, upper - 1);
        const fits = (p: number): boolean => p <= t;
        const r = bisectLargest(minorUnits(upper), (p) => fits(p));
        expect(r.kind).toBe('found');
        if (r.kind === 'found') {
          expect(r.price).toBe(t);
          expect(fits(r.price) && !fits(r.price + 1)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('reports full_price_fits when the threshold is at or above upper', () => {
    const r = bisectLargest(minorUnits(500), (p) => p <= 900);
    expect(r).toEqual({ kind: 'full_price_fits', price: 500 });
  });

  it('reports nothing_affordable when zero does not fit', () => {
    expect(bisectLargest(minorUnits(500), () => false)).toEqual({ kind: 'nothing_affordable' });
  });

  it('throws RangeError on a negative upper', () => {
    expect(() => bisectLargest(-1 as never, () => true)).toThrow(RangeError);
  });
});
