import fc from 'fast-check';
import {
  depositDate,
  goalPlanByDate,
  goalPlanByMonthly,
  monthsToReach,
  neededEachMonth,
} from '../goalPlan';
import { ZERO_PERCENT, percent } from '../../payoff/types';
import { minorUnits } from '../../money/types';
import { goals } from './fixtures/ledger';

const m = minorUnits;
const left = goals.lisbon.target - goals.lisbon.saved;

describe('monthsToReach', () => {
  it.each([
    [2500, 47],
    [5000, 24],
    [7500, 16],
    [10000, 12],
  ])('Lisbon at %i a month takes %i deposits', (add, n) => {
    expect(monthsToReach(m(64000), m(180000), m(add)).deposits).toBe(n);
  });
  it('Laptop', () => {
    expect(monthsToReach(m(0), m(350000), m(29200)).deposits).toBe(12);
    expect(monthsToReach(m(0), m(350000), m(15000)).deposits).toBe(24);
  });
  it('with interest (calc.js saveTo)', () => {
    const r = monthsToReach(m(50000), m(500000), m(25000), percent('3'));
    expect(r).toEqual({ deposits: 18, interest: 11990, value: 511990 });
    expect(monthsToReach(m(50000), m(500000), m(25000), ZERO_PERCENT).deposits).toBe(18);
  });
  it('already there is 0 deposits', () => {
    expect(monthsToReach(m(200000), m(180000), m(100)).deposits).toBe(0);
    expect(monthsToReach(m(180000), m(180000), m(0)).deposits).toBe(0);
  });
  it('add 0 below target never gets there', () => {
    expect(monthsToReach(m(100), m(180000), m(0)).deposits).toBeNull();
  });
  it('interest alone can get there', () => {
    expect(monthsToReach(m(100000), m(101000), m(0), percent('12')).deposits).toBe(1);
  });
  it('caps at 600 deposits', () => {
    expect(monthsToReach(m(0), m(1_000_000), m(1)).deposits).toBeNull();
  });
  it('agrees with a naive loop', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 10, max: 500 }), (have, gap, add) => {
        let b = have;
        let k = 0;
        while (b < have + gap) {
          b += add;
          k++;
        }
        expect(monthsToReach(m(have), m(have + gap), m(add)).deposits).toBe(k);
      }),
    );
  });
});

describe('depositDate', () => {
  it('Lisbon dates', () => {
    expect(depositDate('2026-11-16', 24)).toBe('2028-10-16');
    expect(depositDate('2026-11-16', 47)).toBe('2030-09-16');
    expect(depositDate('2026-11-16', 14)).toBe('2027-12-16');
    expect(depositDate('2026-11-16', 1)).toBe('2026-11-16');
  });
});

describe('neededEachMonth', () => {
  it('rounds up to the cent', () => {
    expect(neededEachMonth(m(left), 24)).toBe(4834);
    expect(neededEachMonth(m(left), 14)).toBe(8286);
    expect(neededEachMonth(m(left), 20)).toBe(5800);
  });
  it('rejects fewer than one deposit', () => {
    expect(() => neededEachMonth(m(100), 0)).toThrow('neededEachMonth: ');
    expect(() => neededEachMonth(m(100), 1.5)).toThrow(RangeError);
  });
  it('is the tight ceiling', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 1, max: 600 }), (l, n) => {
        const x = neededEachMonth(m(l), n);
        expect(x * n).toBeGreaterThanOrEqual(l);
        expect((x - 1) * n).toBeLessThan(l);
      }),
    );
  });
});

describe('goalPlanByMonthly', () => {
  it('Lisbon at 5000 reaches on 2028-10-16', () => {
    expect(goalPlanByMonthly({ have: m(64000), target: m(180000), add: m(5000), anchor: '2026-11-16' })).toEqual({
      deposits: 24,
      reachesOn: '2028-10-16',
      interest: 0,
    });
  });
  it('open-ended goal has no reach date', () => {
    expect(goalPlanByMonthly({ have: m(1000), target: null, add: m(5000), anchor: '2026-11-16' })).toEqual({
      deposits: null,
      reachesOn: null,
      interest: 0,
    });
  });
  it('never at this amount', () => {
    expect(goalPlanByMonthly({ have: m(1000), target: m(5000), add: m(0), anchor: '2026-11-16' })).toEqual({
      deposits: null,
      reachesOn: null,
      interest: 0,
    });
  });
  it('already reached has no date to wait for', () => {
    expect(goalPlanByMonthly({ have: m(5000), target: m(5000), add: m(100), anchor: '2026-11-16' })).toEqual({
      deposits: 0,
      reachesOn: null,
      interest: 0,
    });
  });
  it('passes interest through', () => {
    const r = goalPlanByMonthly({ have: m(50000), target: m(500000), add: m(25000), anchor: '2026-11-16', apr: percent('3') });
    expect(r.deposits).toBe(18);
    expect(r.interest).toBe(11990);
    expect(r.reachesOn).toBe('2028-04-16');
  });
});

describe('goalPlanByDate', () => {
  it('counts anchor month through the due month', () => {
    expect(goalPlanByDate({ have: m(64000), target: m(180000), anchor: '2026-11-16', byDate: '2027-12-16' })).toEqual({
      deposits: 14,
      neededEachMonth: 8286,
    });
  });
  it('a date in the anchor month or earlier is one deposit', () => {
    expect(goalPlanByDate({ have: m(64000), target: m(180000), anchor: '2026-11-16', byDate: '2026-11-30' }).deposits).toBe(1);
    expect(goalPlanByDate({ have: m(64000), target: m(180000), anchor: '2026-11-16', byDate: '2026-01-01' }).deposits).toBe(1);
  });
  it('nothing to save when already there', () => {
    expect(goalPlanByDate({ have: m(200000), target: m(180000), anchor: '2026-11-16', byDate: '2027-12-16' })).toEqual({
      deposits: 14,
      neededEachMonth: 0,
    });
  });
});
