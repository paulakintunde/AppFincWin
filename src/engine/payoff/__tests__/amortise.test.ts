import fc from 'fast-check';
import { amortise, amortiseDue } from '../amortise';
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

describe('D-80 amortiseDue (first payment on the day)', () => {
  it('D-80 amortiseDue pays first at month 0 and clears exactly', () => {
    // 1,200.00 at 12% over 12: the ordinary payment is 106.62, the due payment 105.57 (106.6185 / 1.01 = 105.56 rounded up).
    const ordinary = amortise(m(120_000), percent('12'), 12);
    const due = amortiseDue(m(120_000), percent('12'), 12);
    expect(ordinary.payment).toBe(10_662);
    expect(due.payment).toBe(10_557);
    expect(due.months).toBe(12);
    expect(due.termMonths).toBe(12);
    // Hand walk: pay 105.57 at month 0 leaves 1,094.43, then interest accrues monthly.
    let bal = 120_000 - 10_557;
    let paid = 10_557;
    let interest = 0;
    for (let k = 1; k <= 11; k++) {
      const i = Number(divideHalfUp(BigInt(bal) * 12n * 10n ** 10n, 1200n * 10n ** 10n));
      interest += i;
      const owed = bal + i;
      const pay = k === 11 ? owed : Math.min(10_557, owed);
      paid += pay;
      bal = owed - pay;
    }
    expect(bal).toBe(0);
    expect(due.totalPaid).toBe(paid);
    expect(due.totalInterest).toBe(interest);
    expect(due.totalPaid).toBe(120_000 + due.totalInterest);
  });

  it('D-80 amortiseDue at 0% is ceil(principal over months)', () => {
    const due = amortiseDue(m(500_000), ZERO_PERCENT, 12);
    expect(due.payment).toBe(41_667);
    expect(due.finalPayment).toBe(41_663);
    expect(due.totalInterest).toBe(0);
    expect(due.totalPaid).toBe(500_000);
    expect(due.months).toBe(12);
  });

  it('D-80 amortiseDue with nothing financed pays nothing', () => {
    const due = amortiseDue(m(0), percent('12'), 6);
    expect(due).toEqual({ payment: 0, finalPayment: 0, months: 0, termMonths: 6, totalPaid: 0, totalInterest: 0 });
  });

  it('D-80 amortiseDue over one month is the whole principal on the day', () => {
    const due = amortiseDue(m(50_000), percent('20'), 1);
    expect(due.payment).toBe(50_000);
    expect(due.months).toBe(1);
    expect(due.totalInterest).toBe(0);
  });

  it('D-80 amortiseDue can clear on the day when the payment covers the principal', () => {
    // 1 minor unit over 3 months at 0%: ceil(1 / 3) = 1 clears at month 0.
    const due = amortiseDue(m(1), ZERO_PERCENT, 3);
    expect(due.payment).toBe(1);
    expect(due.months).toBe(1);
    expect(due.totalPaid).toBe(1);
  });

  it('D-80 the due payment never exceeds the ordinary payment', () => {
    const principals = [1, 99, 100_000, 1_234_567, 90_000_000];
    const aprs = ['0', '0.5', '4.9', '12', '22.9', '99.99', '299', '999.99'];
    const terms = [1, 2, 3, 6, 12, 24, 60, 120];
    let stepped = 0;
    for (const p of principals) {
      for (const a of aprs) {
        for (const n of terms) {
          const apr = percent(a);
          const due = amortiseDue(m(p), apr, n);
          const ord = amortise(m(p), apr, n);
          expect(due.payment).toBeLessThanOrEqual(ord.payment);
          expect(due.totalPaid).toBe(p + due.totalInterest);
          expect(due.finalPayment).toBeLessThanOrEqual(due.payment);
          expect(due.totalInterest).toBeLessThanOrEqual(ord.totalInterest);
          if (due.finalPayment > 0) stepped += 1;
        }
      }
    }
    expect(stepped).toBeGreaterThan(0);
  });

  it('D-80 amortiseDue rejects a bad term or a negative principal', () => {
    expect(() => amortiseDue(m(100), percent('5'), 0)).toThrow(RangeError);
    expect(() => amortiseDue(-1 as never, percent('5'), 6)).toThrow(RangeError);
  });
});
