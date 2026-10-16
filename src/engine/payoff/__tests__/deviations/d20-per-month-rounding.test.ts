/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import fixtures from '../golden/prototype-payoff.json';
import { amortise } from '../../amortise';
import { percent } from '../../types';
import { minorUnits } from '../../../money/types';

const m = minorUnits;

describe('D-20 per-month rounding', () => {
  it.each(fixtures.dpmt)('D-20: the final payment absorbs the residual so totalPaid === principal + totalInterest ($name)', (c) => {
    const [p, apr, n] = c.args as [number, number, number];
    const principal = Math.round(p * 100);
    const r = amortise(m(principal), percent(String(apr)), n);
    expect(r.totalPaid).toBe(principal + r.totalInterest);
  });

  it.each(fixtures.dpmt)('D-20: engine total interest differs from the prototype mo*n - P by at most ceil(n/2) + 1 minor units ($name)', (c) => {
    // The prototype multiplies an unrounded float payment; the engine rounds each month half-up once.
    const [p, apr, n] = c.args as [number, number, number];
    const principal = Math.round(p * 100);
    const r = amortise(m(principal), percent(String(apr)), n);
    const protoInterest = Math.round((c.raw * n - p) * 100);
    // Ill-conditioned terms (payment barely above first-month interest, e.g. 22.9% over 600 months):
    // a sub-unit rounding of the level payment is amplified by the annuity factor A = ((1+r)^n - 1) / r
    // through the compounding balance, and the final payment absorbs it. The bound is widened by 0.5 * A
    // only when A is large; well-conditioned cases keep the tight ceil(n/2) + 1 bound.
    // D-64: the level payment now rounds UP, so it sits delta = payment - exact (0 <= delta < 2; under 1 unless the
    // one-unit D-64 step applied) above the prototype's float. Paying delta more each month retires principal earlier,
    // which lowers the total interest by about delta x (A - n); that term is added to the bound.
    const r1 = apr / 1200;
    const annuity = r1 === 0 ? n : (Math.pow(1 + r1, n) - 1) / r1;
    const delta = Math.max(0, r.payment - c.raw * 100);
    const bound =
      Math.ceil(n / 2) + 1 + (annuity > 5_000 ? Math.ceil(annuity / 2) : 0) + Math.ceil(delta * Math.max(0, annuity - n));
    expect(Math.abs(r.totalInterest - protoInterest)).toBeLessThanOrEqual(bound);
  });
});
