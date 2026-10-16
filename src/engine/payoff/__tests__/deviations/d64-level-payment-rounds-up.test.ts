/**
 * Named deviation (D-22) for D-64, which amends D-20 (ratified 2026-10-16; 04-REVIEW HI-04). Reviewers and the Phase 5
 * team read this file to see why a payment differs from the prototype or a printed table.
 *
 * The amortised level payment rounds UP to the minor unit, so it never undershoots, and the final payment (the
 * remaining balance plus that month's interest) is never more than the level payment. Half-up rounding left a
 * compounding residual in the final month: 1,000.00 at 22.9% over 360 months had a level payment of 19.10 and a final
 * payment of 233.58, and over 600 months 19.08 and 1,019.08 (the loan never amortised). The month test, the cash path
 * and `paymentSteps` never saw that balloon month.
 *
 * What moved, all by one minor unit of the level payment:
 * - D-57 references R1 (64.62 -> 64.63), R2 (973.50 -> 973.51), R4 (86.27 -> 86.28) and the 0% split (83.33 -> 83.34);
 *   R3 (819.16) is unchanged. The printed rows are still checked by replaying them at the printed payment.
 * - The known-table payments 1,199.10 -> 1,199.11, 599.55 -> 599.56, 396.02 -> 396.03 (amortise.test.ts).
 * - Prototype `dpmt` parity stays within its 1-unit tolerance; the total-interest bound in d20-per-month-rounding
 *   widens by delta x (A - n) for the delta the payment now sits above the float.
 */
import fc from 'fast-check';
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits } from '../../../money/types';
import { amortise } from '../../amortise';
import { amortiseSchedule, singleRate } from '../../rateSchedule';
import { MONTHLY_RATE_DENOMINATOR, ZERO_PERCENT, percent, percentFromScaled, type Percent } from '../../types';

const m = minorUnits;
const D = MONTHLY_RATE_DENOMINATOR;

/** The pre-D-64 level payment: the exact annuity payment rounded half-up. */
function halfUpPayment(principal: number, apr: Percent, n: number): bigint {
  const P = BigInt(principal);
  if (apr === 0n) return divideHalfUp(P, BigInt(n));
  const An = (D + apr) ** BigInt(n);
  const Dn = D ** BigInt(n);
  return divideHalfUp(P * apr * An, D * (An - Dn));
}

describe('D-64: the level payment rounds up and the final payment never exceeds it', () => {
  it.each([
    [100_000, '22.9', 360],
    [100_000, '22.9', 600],
    [10_000_000, '29.9', 600],
    [500_000, '29.9', 360],
  ])('the balloon month is gone: %i at %s%% over %i months', (p, apr, n) => {
    const r = amortise(m(p), percent(apr), n);
    expect(r.finalPayment).toBeLessThanOrEqual(r.payment);
    expect(r.totalPaid).toBe(p + r.totalInterest);
  });

  it('the review figures: 1,000.00 at 22.9% over 360 months pays 19.11 (half-up 19.10 left a final 233.58)', () => {
    const r = amortise(m(100_000), percent('22.9'), 360);
    expect(halfUpPayment(100_000, percent('22.9'), 360)).toBe(1_910n);
    expect(r.payment).toBe(1_911);
    expect(r.finalPayment).toBeLessThanOrEqual(1_911);
  });

  it('is the exact payment rounded up, or one unit more when per-month half-up interest needs it', () => {
    // 1,000,000.00 at 0.5% over 3 months: the exact payment rounded up is 333,611.15, but the half-up interest rounding
    // leaves a final payment of 333,611.16, so the payment steps up one unit.
    const r = amortise(m(100_000_000), percent('0.5'), 3);
    expect(r.payment).toBe(33_361_116);
    expect(r.finalPayment).toBeLessThanOrEqual(r.payment);
    // the ordinary case: exactly one unit above half-up when the exact payment's fraction is below one half
    const half = Number(halfUpPayment(1_000_000, percent('4.75'), 240));
    expect(amortise(m(1_000_000), percent('4.75'), 240).payment).toBe(half + 1);
  });

  it('0%: an even split rounded up', () => {
    expect(amortise(m(100_000), ZERO_PERCENT, 12).payment).toBe(8_334);
    expect(amortise(m(120_000), ZERO_PERCENT, 12).payment).toBe(10_000);
  });

  it('property: final <= payment, payment within 2 units above the half-up figure, totals exact; schedule agrees', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.bigInt({ min: 0n, max: 99_9999999999n }),
        fc.integer({ min: 1, max: 600 }),
        (principal, scaled, n) => {
          const apr = percentFromScaled(scaled);
          const r = amortise(m(principal), apr, n);
          expect(r.finalPayment).toBeLessThanOrEqual(r.payment);
          expect(r.totalPaid).toBe(principal + r.totalInterest);
          const half = Number(halfUpPayment(principal, apr, n));
          expect(r.payment - half).toBeLessThanOrEqual(2);
          const s = amortiseSchedule(m(principal), singleRate(apr), n);
          expect(s.payment).toBe(r.payment);
          expect(s.totalInterest).toBe(r.totalInterest);
        }
      ),
      { numRuns: 300 }
    );
  });
});
