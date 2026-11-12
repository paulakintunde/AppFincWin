import fc from 'fast-check';
import golden from './golden/calc-grow.json';
import { fixedPayoff } from '../fixedPayoff';
import { divideHalfUp } from '../../money/rounding';
import { MONTHLY_RATE_DENOMINATOR, percent } from '../types';
import { minorUnits, type MinorUnits } from '../../money/types';

const m = minorUnits;
const APR = percent('6.9');
const LOAN = m(842_000);
const PAY = m(31_200);

describe('fixedPayoff', () => {
  it('no extra: 30 months, 75636 interest, 12836 last payment', () => {
    const r = fixedPayoff(LOAN, APR, PAY);
    expect(r).toEqual({
      outcome: 'cleared',
      months: 30,
      totalInterest: 75_636,
      lastPayment: 12_836,
      remainingBalance: 0,
    });
    expect(r.months).toBe(golden.loanMin.months);
    expect(r.totalInterest).toBe(golden.loanMin.totalInt);
    expect(r.lastPayment).toBe(golden.loanMin.last);
  });

  it.each([
    [2_500, 28, 69_599, 1_699, golden.extra2500],
    [5_000, 26, 64_491, 1_491, golden.extra5000],
    [10_000, 22, 56_318, 33_118, golden.extra10000],
  ])('extra %i a month', (extra, months, interest, last, g) => {
    const r = fixedPayoff(LOAN, APR, PAY, { extra: m(extra) });
    expect(r.outcome).toBe('cleared');
    expect(r.months).toBe(months);
    expect(r.totalInterest).toBe(interest);
    expect(r.lastPayment).toBe(last);
    expect([g.months, g.totalInt, g.last]).toEqual([months, interest, last]);
  });

  it('lump 100000 before the first interest: 26 months, 58204, 20204', () => {
    const r = fixedPayoff(LOAN, APR, PAY, { lump: m(100_000) });
    expect(r.months).toBe(26);
    expect(r.totalInterest).toBe(58_204);
    expect(r.lastPayment).toBe(20_204);
    expect(golden.once1000.totalInt).toBe(58_204);
  });

  it('a payment that only matches month-1 interest never clears', () => {
    const interest = Number(divideHalfUp(842_000n * APR, MONTHLY_RATE_DENOMINATOR));
    expect(interest).toBe(4_842);
    for (const pay of [interest, interest - 1, 0]) {
      const r = fixedPayoff(LOAN, APR, m(pay));
      expect(r.outcome).toBe('never_clears');
      expect(r.totalInterest).toBeNull();
      expect(r.remainingBalance).toBe(842_000);
    }
  });

  it('a payment above balance plus interest clears in one month', () => {
    const r = fixedPayoff(m(100_000), APR, m(500_000));
    expect(r.months).toBe(1);
    expect(r.lastPayment).toBe(100_000 + 575);
    expect(r.totalInterest).toBe(575);
  });

  it('zero balance is cleared at once', () => {
    expect(fixedPayoff(m(0), APR, PAY)).toEqual({
      outcome: 'cleared',
      months: 0,
      totalInterest: 0,
      lastPayment: 0,
      remainingBalance: 0,
    });
  });

  it('a lump that covers the balance clears at once', () => {
    const r = fixedPayoff(m(50_000), APR, PAY, { lump: m(60_000) });
    expect(r.months).toBe(0);
    expect(r.totalInterest).toBe(0);
  });

  it.each([
    ['balance', () => fixedPayoff(-1 as MinorUnits, APR, PAY)],
    ['payment', () => fixedPayoff(LOAN, APR, -1 as MinorUnits)],
    ['extra', () => fixedPayoff(LOAN, APR, PAY, { extra: -1 as MinorUnits })],
    ['lump', () => fixedPayoff(LOAN, APR, PAY, { lump: -1 as MinorUnits })],
  ])('negative %s throws', (_n, fn) => {
    expect(fn).toThrow(RangeError);
    expect(fn).toThrow(/^fixedPayoff: /);
  });

  it('payment barely above interest hits the 600-month cap', () => {
    const r = fixedPayoff(m(1_000_000), percent('12'), m(10_001));
    expect(r.outcome).toBe('exceeds_month_cap');
    expect(r.months).toBe(600);
    expect(r.remainingBalance).toBeGreaterThan(0);
  });

  describe('properties', () => {
    const arb = fc.record({
      bal: fc.integer({ min: 0, max: 5_000_000 }),
      apr: fc.integer({ min: 0, max: 3_000 }).map((n) => percent((n / 100).toFixed(2))),
      pay: fc.integer({ min: 0, max: 400_000 }),
      extra: fc.integer({ min: 0, max: 100_000 }),
      lump: fc.integer({ min: 0, max: 1_000_000 }),
    });

    it('interest >= 0, months <= 600, payments add up exactly, safe integers', () => {
      fc.assert(
        fc.property(arb, (a) => {
          const r = fixedPayoff(m(a.bal), a.apr, m(a.pay), { extra: m(a.extra), lump: m(a.lump) });
          expect(r.months).toBeLessThanOrEqual(600);
          expect(Number.isSafeInteger(r.lastPayment)).toBe(true);
          if (r.outcome === 'cleared') {
            const ti = r.totalInterest as number;
            expect(ti).toBeGreaterThanOrEqual(0);
            const start = Math.max(0, a.bal - a.lump);
            const paid = r.months === 0 ? 0 : (a.pay + a.extra) * (r.months - 1) + r.lastPayment;
            expect(paid).toBe(start + ti);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('never_clears iff the first payment cannot cover the first interest', () => {
      fc.assert(
        fc.property(arb, (a) => {
          const r = fixedPayoff(m(a.bal), a.apr, m(a.pay), { extra: m(a.extra), lump: m(a.lump) });
          const start = BigInt(Math.max(0, a.bal - a.lump));
          const interest = divideHalfUp(start * a.apr, MONTHLY_RATE_DENOMINATOR);
          const expected = start > 0n && BigInt(a.pay + a.extra) <= interest;
          expect(r.outcome === 'never_clears').toBe(expected);
        }),
        { numRuns: 100 }
      );
    });

    it('more extra never raises months or interest', () => {
      fc.assert(
        fc.property(arb, fc.integer({ min: 0, max: 50_000 }), (a, more) => {
          const lo = fixedPayoff(m(a.bal), a.apr, m(a.pay), { extra: m(a.extra) });
          const hi = fixedPayoff(m(a.bal), a.apr, m(a.pay), { extra: m(a.extra + more) });
          if (lo.outcome === 'cleared' && hi.outcome === 'cleared') {
            expect(hi.months).toBeLessThanOrEqual(lo.months);
            expect(hi.totalInterest as number).toBeLessThanOrEqual(lo.totalInterest as number);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
