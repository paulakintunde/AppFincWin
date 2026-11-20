import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { householdDelta, householdLeft } from '../pool';

const mu = minorUnits;

describe('08.1-08 householdLeft (pool and split, owner 2026-11-20)', () => {
  it('HH-08 / HH-10: $1,000 and $4,000 at 60/40 give $3,000 and $2,000', () => {
    expect(householdLeft(mu(100_000), [mu(400_000)], [60, 40], 0)).toBe(300_000);
    expect(householdLeft(mu(400_000), [mu(100_000)], [60, 40], 1)).toBe(200_000);
  });
  it('with no partner figure there is no pool: my own money, unchanged', () => {
    expect(householdLeft(mu(100_000), [], [60, 40], 0)).toBe(100_000);
    expect(householdDelta(mu(100_000), [], [60, 40], 0)).toBe(0);
  });
  it('the delta is the slice less my own', () => {
    expect(householdDelta(mu(100_000), [mu(400_000)], [60, 40], 0)).toBe(200_000);
    expect(householdDelta(mu(400_000), [mu(100_000)], [60, 40], 1)).toBe(-200_000);
  });
  it('a partner in the red shrinks the pool', () => {
    expect(householdLeft(mu(100_000), [mu(-40_000)], [1, 1], 0)).toBe(30_000);
  });
  it('three in the pool: the slices add up to the pool', () => {
    const own = [mu(100_000), mu(50_000), mu(25_000)];
    const slices = [0, 1, 2].map((i) => householdLeft(own[i]!, own.filter((_, j) => j !== i), [2, 1, 1], i));
    expect(slices.reduce((a, b) => a + b, 0)).toBe(175_000);
  });
  it('property: two partners see the same pool, so their slices never add to more than it', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5_000_000, max: 5_000_000 }), fc.integer({ min: -5_000_000, max: 5_000_000 }), fc.integer({ min: 1, max: 99 }), (a, b, w) => {
        const weights = [w, 100 - w];
        const x = householdLeft(mu(a), [mu(b)], weights, 0);
        const y = householdLeft(mu(b), [mu(a)], weights, 1);
        expect(x + y).toBe(a + b);
      }),
      { numRuns: 200, seed: 0x0818 },
    );
  });
});
