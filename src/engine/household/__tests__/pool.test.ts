import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { householdDelta, householdLeft, spendDelta, spendSlice } from '../pool';

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

describe('08.1-22 spendSlice / spendDelta (the group\'s spending rule)', () => {
  const bring = { kind: 'bring' } as const;
  const shares = (...weights: number[]) => ({ kind: 'shares', weights }) as const;
  it('What each person brings is my own money', () => {
    expect(spendSlice(mu(100_000), [null, mu(400_000)], bring, 0)).toBe(100_000);
    expect(spendDelta(mu(100_000), [null, mu(400_000)], bring, 0)).toBe(0);
  });
  it('HH-14/HH-15: a set 50/50 split of $5,000', () => {
    expect(spendSlice(mu(100_000), [null, mu(400_000)], shares(50, 50), 0)).toBe(250_000);
    expect(spendSlice(mu(400_000), [mu(100_000), null], shares(50, 50), 1)).toBe(250_000);
  });
  it('HH-21: a member who does not count is left out and the shares re-scale (cents, spare cent to the larger remainder)', () => {
    const lefts = [mu(60_000), mu(120_000), null] as const;
    const ben = spendSlice(mu(60_000), lefts, shares(40, 30, 30), 0);
    const cat = spendSlice(mu(120_000), [null, null, null], shares(40, 30, 30), 1);
    expect(ben).toBe(102_857);
    expect(spendSlice(mu(120_000), [mu(60_000), mu(120_000), null], shares(40, 30, 30), 1)).toBe(77_143);
    expect(cat).toBe(120_000); // alone in the pool: own money
  });
  it('a member with 0% has a zero slice (HH-24), and a pool whose shares are all zero is my own money', () => {
    expect(spendSlice(mu(30_000), [mu(270_000), null], shares(100, 0), 1)).toBe(0);
    expect(spendSlice(mu(30_000), [mu(270_000), null], shares(0, 0), 1)).toBe(30_000);
  });
  it('a pool of one is my own money', () => {
    expect(spendSlice(mu(30_000), [null, null], shares(50, 50), 1)).toBe(30_000);
  });
  it('property: slices of everyone in the pool add up to the pool', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -2_000_000, max: 2_000_000 }), { minLength: 3, maxLength: 3 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }),
        (lefts, weights) => {
          fc.pre(weights.every((w) => w > 0));
          const total = [0, 1, 2].reduce((s, i) => s + spendSlice(mu(lefts[i]!), lefts.map((l, j) => (j === i ? null : mu(l))), shares(...weights), i), 0);
          expect(total).toBe(lefts.reduce((a, b) => a + b, 0));
        },
      ),
      { numRuns: 200, seed: 0x2202 },
    );
  });
});
