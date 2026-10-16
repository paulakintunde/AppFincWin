import fc from 'fast-check';
import { amortise } from '../amortise';
import { ZERO_PERCENT, percent, percentFromScaled } from '../types';
import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';

const m = minorUnits;

describe('amortise known tables', () => {
  // D-64 (amends D-20): the level payment rounds UP. The published half-up figures were 119,910, 59,955 and 39,602; the
  // exact payments are 1,199.10..., 599.55... and 396.02..., so the engine's are one unit above (named in
  // deviations/d64-level-payment-rounds-up.test.ts). 88.85 is exact to within a unit either way.
  it.each([
    [20_000_000, '6', 360, 119_911],
    [10_000_000, '6', 360, 59_956],
    [2_000_000, '7', 60, 39_603],
    [100_000, '12', 12, 8_885],
  ])('principal %i at %s%% over %i months', (p, apr, n, expected) => {
    expect(amortise(m(p), percent(apr), n).payment).toBe(expected);
  });
});

describe('amortise edge cases', () => {
  it('handles zero rate', () => {
    const r = amortise(m(500_000), ZERO_PERCENT, 12);
    expect(r.payment).toBe(41_667);
    expect(r.finalPayment).toBe(41_663);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(500_000);
  });

  it('handles n = 1', () => {
    const r = amortise(m(500_000), percent('9.4'), 1);
    const expected = 500_000 + Number(divideHalfUp(500_000n * 94_000_000_000n, 12_000_000_000_000n));
    expect(r.finalPayment).toBe(expected);
    expect(r.totalPaid).toBe(r.finalPayment);
  });

  it('handles n = 600', () => {
    const r = amortise(m(10_000_000), percent('22.9'), 600);
    expect(r.totalPaid).toBe(10_000_000 + r.totalInterest);
    expect(r.payment).toBeGreaterThan(Math.round((10_000_000 * 22.9) / 1200));
  });

  it('handles principal 0', () => {
    const r = amortise(m(0), percent('5'), 12);
    expect(r.payment).toBe(0);
    expect(r.finalPayment).toBe(0);
    expect(r.totalInterest).toBe(0);
  });

  it('clamps tiny principal over a long term', () => {
    const r = amortise(m(400), ZERO_PERCENT, 600);
    expect(r.payment).toBe(1);
    expect(r.totalPaid).toBe(400);
    // 04-REVIEW ME-03: it clears in month 400; the final payment is that month's 0.01, not the term's 0
    expect(r.finalPayment).toBe(1);
    expect(r.months).toBe(400);
    expect(r.termMonths).toBe(600);
  });

  it.each([0, -1, 1.5, 601])('rejects months %p', (n) => {
    expect(() => amortise(m(1000), percent('5'), n)).toThrow(/^amortise: /);
  });

  it('rejects negative principal', () => {
    expect(() => amortise(m(-1), percent('5'), 12)).toThrow(RangeError);
  });
});

describe('amortise properties', () => {
  const principal = fc.integer({ min: 0, max: 100_000_000_000 });
  const apr = fc.bigInt({ min: 0n, max: 500_000_000_000n });
  const months = fc.integer({ min: 1, max: 600 });

  it('totalPaid identity and non-negative final payment', () => {
    fc.assert(
      fc.property(principal, apr, months, (p, a, n) => {
        const r = amortise(m(p), percentFromScaled(a), n);
        expect(r.totalPaid).toBe(p + r.totalInterest);
        expect(r.finalPayment).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it('payment is non-decreasing in principal and apr', () => {
    fc.assert(
      fc.property(principal, principal, apr, apr, months, (p1, p2, a1, a2, n) => {
        const [pl, ph] = p1 <= p2 ? [p1, p2] : [p2, p1];
        const [al, ah] = a1 <= a2 ? [a1, a2] : [a2, a1];
        const base = amortise(m(pl), percentFromScaled(al), n).payment;
        expect(amortise(m(ph), percentFromScaled(al), n).payment).toBeGreaterThanOrEqual(base);
        expect(amortise(m(pl), percentFromScaled(ah), n).payment).toBeGreaterThanOrEqual(base);
      }),
      { numRuns: 100 }
    );
  });
});
