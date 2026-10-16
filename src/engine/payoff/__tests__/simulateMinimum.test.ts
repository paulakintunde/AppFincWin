import fc from 'fast-check';
import { simulateMinimum } from '../simulateMinimum';
import { ZERO_PERCENT, percent, type CardMinimumTerms } from '../types';
import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';

const m = minorUnits;
const PROTO: CardMinimumTerms = { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) };
const NO_INTEREST_1PCT: CardMinimumTerms = { minimumPercent: percent('1'), interestAdded: false, floor: m(2_500) };

describe('simulateMinimum', () => {
  it('SC-2: a card at 22.9% APR with a 1% minimum never clears (explicit payment <= interest check)', () => {
    const r = simulateMinimum(m(500_000), percent('22.9'), NO_INTEREST_1PCT);
    expect(r.outcome).toBe('never_clears');
    expect(r.months).toBe(1);
    expect(r.firstPayment).toBe(5_000);
    expect(r.totalInterest).toBeNull();
    expect(r.remainingBalance).toBe(500_000);
    // month-1 interest is 9_542, above the 5_000 payment
    expect(Number(divideHalfUp(500_000n * percent('22.9'), 1200n * 10n ** 10n))).toBe(9_542);
  });

  it('clears when the floor beats interest', () => {
    const r = simulateMinimum(m(100_000), percent('22.9'), NO_INTEREST_1PCT);
    expect(r.outcome).toBe('cleared');
    expect(r.remainingBalance).toBe(0);
  });

  it('prototype formula (1% + interest, 25.00 floor) always clears: the prototype never-branch is unreachable', () => {
    const r = simulateMinimum(m(500_000), percent('22.9'), PROTO);
    expect(r.outcome).toBe('cleared');
    expect(r.months).toBeGreaterThan(100);
    expect(r.months).toBeLessThan(600);
    expect(Number(r.totalInterest)).toBeGreaterThan(0);
    expect(r.firstPayment).toBe(5_000 + 9_542);
  });

  it('D-17: still open at 600 months without ever tripping never-clears is exceeds_month_cap', () => {
    const r = simulateMinimum(m(1_000_000), percent('22.9'), {
      minimumPercent: percent('2'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(r.outcome).toBe('exceeds_month_cap');
    expect(r.months).toBe(600);
    expect(r.remainingBalance).toBeGreaterThan(0);
    expect(r.totalInterest).not.toBeNull();
    expect(Number.isFinite(r.totalInterest)).toBe(true);
  });

  it('a small balance clears in one month', () => {
    const r = simulateMinimum(m(2_000), percent('22.9'), PROTO);
    expect(r.outcome).toBe('cleared');
    expect(r.months).toBe(1);
    expect(r.firstPayment).toBe(2_000 + Number(divideHalfUp(2_000n * percent('22.9'), 1200n * 10n ** 10n)));
  });

  it('zero balance is cleared immediately', () => {
    expect(simulateMinimum(m(0), percent('22.9'), PROTO)).toEqual({
      outcome: 'cleared',
      months: 0,
      firstPayment: 0,
      totalInterest: 0,
      remainingBalance: 0,
    });
  });

  it('zero APR edge cases', () => {
    const a = simulateMinimum(m(49), ZERO_PERCENT, { minimumPercent: percent('1'), interestAdded: false, floor: m(0) });
    expect(a.outcome).toBe('never_clears');
    expect(a.months).toBe(1);
    const b = simulateMinimum(m(80_000), ZERO_PERCENT, {
      minimumPercent: percent('0'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(b.outcome).toBe('cleared');
    expect(b.months).toBe(32);
  });

  it('rejects a negative balance', () => {
    expect(() => simulateMinimum(-1 as never, percent('10'), PROTO)).toThrow(/^simulateMinimum: /);
  });

  it('property: outcomes are internally consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 5 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 10_000 }),
        (bal, apr, pct, added, floor) => {
          const r = simulateMinimum(m(bal), percent(String(apr)), {
            minimumPercent: percent(String(pct)),
            interestAdded: added,
            floor: m(floor),
          });
          if (r.outcome === 'cleared') {
            expect(r.remainingBalance).toBe(0);
            expect(r.months).toBeGreaterThanOrEqual(1);
            expect(r.months).toBeLessThanOrEqual(600);
          } else if (r.outcome === 'never_clears') {
            expect(r.totalInterest).toBeNull();
          } else {
            expect(r.months).toBe(600);
            expect(r.remainingBalance).toBeGreaterThan(0);
          }
          if (r.outcome !== 'never_clears') expect(r.firstPayment).toBeGreaterThan(0);
        }
      )
    );
  });
});
