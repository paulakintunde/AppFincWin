// 08.1-11 FIN-12: the "0% if paid in full" back-charge. Worked figures are the owner-approved cases BR-24 / BR-25 (2026-11-20).
import { minorUnits } from '../../../../money/types';
import { ZERO_PERCENT, percent } from '../../../../payoff/types';
import type { Cadence, PlanFees, Schedule } from '../../types';
import { MONTHLY, WEEKLY } from '../cadence';
import { deferredInterest } from '../deferredInterest';
import { buildSchedule } from '../schedule';

const NO_FEES: PlanFees = { setup: minorUnits(0), perPeriod: minorUnits(0), end: minorUnits(0) };
const ASOF = '2026-11-15';

function zeroPlan(over: { count: number; financed?: number; cadence?: Cadence; first?: 'one_period' | 'today'; fees?: PlanFees; deferredDate?: string }): Schedule {
  const out = buildSchedule({
    asOf: ASOF,
    financed: minorUnits(over.financed ?? 120000),
    apr: ZERO_PERCENT,
    cadence: over.cadence ?? MONTHLY,
    count: over.count,
    firstPayment: over.deferredDate !== undefined ? { kind: 'deferred', firstDate: over.deferredDate, interestDuringPause: false } : { kind: over.first ?? 'one_period' },
    fees: over.fees ?? NO_FEES,
  });
  if (!out.ok) throw new Error('schedule');
  return out.schedule;
}

const AFTER = percent('24.99');

describe('deferredInterest', () => {
  it('BR-24: ten payments finish before the end date, so nothing is charged back', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 10 }), promoEnd: '2027-11-15', rateAfter: AFTER });
    expect(r).toEqual({ kind: 'cleared', endDate: '2027-11-15' });
  });

  it('the last payment on the end date itself still clears it', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 12 }), promoEnd: '2027-11-15', rateAfter: AFTER });
    expect(r.kind).toBe('cleared');
  });

  it('BR-25: 16 payments of 75.00 against a 12 month deal: 196.80 back-charged, 43.47 more after, 240.27 in all', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 16 }), promoEnd: '2027-11-15', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    expect(Number(r.backCharge)).toBe(19680);
    expect(r.endDate).toBe('2027-11-15');
    expect(Number(r.schedule.totalInterest)).toBe(24027);
    expect(Number(r.schedule.totalPaid)).toBe(144027);
    expect(r.schedule.lastPaying).toBe(20);
    expect(r.schedule.count).toBe(20);
    expect(Number(r.schedule.payment)).toBe(7500);
    expect(Number(r.schedule.finalPayment)).toBeGreaterThan(0);
    expect(Number(r.schedule.finalPayment)).toBeLessThanOrEqual(7500);
    expect(Number(r.schedule.monthlyEquivalent)).toBe(7500);
    expect(r.schedule.exactInterestBp).toBeUndefined();
  });

  it('total paid is the amount borrowed plus all the interest plus the fees on every payment', () => {
    const fees: PlanFees = { setup: minorUnits(0), perPeriod: minorUnits(100), end: minorUnits(500) };
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 16, fees }), promoEnd: '2027-11-15', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    expect(Number(r.schedule.totalPaid)).toBe(120000 + Number(r.schedule.totalInterest) + 100 * r.schedule.lastPaying + 500);
    expect(Number(r.schedule.monthlyEquivalent)).toBe(7600);
  });

  it('a first payment on the day of buying carries no wait before it', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 16, first: 'today' }), promoEnd: '2027-02-15', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    // payments on 15 Nov .. 15 Feb: the first has no interest period before it, the next three one each, on the balance left before each.
    const rate = Number(24.99) / 12 / 100;
    let bal = 120000;
    let want = 0;
    for (let n = 0; n < 4; n++) {
      if (n > 0) want += Math.round(bal * rate);
      bal -= 7500;
    }
    expect(Math.abs(Number(r.backCharge) - want)).toBeLessThanOrEqual(2);
  });

  it('a first payment that waits several periods charges those periods on the full balance', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 16, deferredDate: '2027-01-15' }), promoEnd: '2027-02-15', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    const one = Math.round(120000 * (24.99 / 12 / 100));
    // 2 periods before 15 Jan on 1200.00; then 15 Jan and 15 Feb are payment dates: one period each on the balance left.
    expect(Number(r.backCharge)).toBeGreaterThan(2 * one);
  });

  it('an end date before the first payment charges the whole periods to it on the full balance', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 6 }), promoEnd: '2026-12-01', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    // 15 Nov to 1 Dec holds no whole month: nothing has built up yet, and the whole 1200.00 is still owed.
    expect(Number(r.backCharge)).toBe(0);
    expect(Number(r.schedule.totalInterest)).toBeGreaterThan(0);
    const r2 = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 6 }), promoEnd: '2027-01-01', rateAfter: AFTER });
    if (r2.kind !== 'back_charge') throw new Error('expected back_charge');
    // one whole month (to 15 Dec) is charged on the full balance, but the 15 Dec payment is dated inside the window, so it is a payment period.
    expect(Number(r2.backCharge)).toBeGreaterThan(0);
  });

  it('a deal ending before the first payment: whole periods from day one to it are charged', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 6, deferredDate: '2027-03-15' }), promoEnd: '2027-02-20', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    // 3 whole months (15 Dec, 15 Jan, 15 Feb) on the full 1200.00
    expect(Number(r.backCharge)).toBe(3 * Math.round(120000 * (24.99 / 12 / 100)));
  });

  it('weekly plans amortise at the weekly rate', () => {
    const r = deferredInterest({ asOf: ASOF, schedule: zeroPlan({ count: 20, cadence: WEEKLY }), promoEnd: '2026-12-20', rateAfter: AFTER });
    if (r.kind !== 'back_charge') throw new Error('expected back_charge');
    expect(Number(r.backCharge)).toBeGreaterThan(0);
    expect(r.schedule.cadence).toEqual(WEEKLY);
  });

  it('the UK reading of the rate (country given) gives a different, lower periodic rate', () => {
    const base = { asOf: ASOF, schedule: zeroPlan({ count: 16 }), promoEnd: '2027-11-15', rateAfter: AFTER };
    const us = deferredInterest(base);
    const uk = deferredInterest({ ...base, country: 'GB' });
    if (us.kind !== 'back_charge' || uk.kind !== 'back_charge') throw new Error('expected back_charge');
    expect(Number(uk.backCharge)).toBeLessThan(Number(us.backCharge));
  });

  it('payments that never cover the interest do not pay the plan off', () => {
    const s = zeroPlan({ count: 600, financed: 100000000 });
    // 600 payments of 1666.67 at 0%; a huge rate after the end date outruns the payment.
    expect(() => deferredInterest({ asOf: ASOF, schedule: s, promoEnd: '2026-12-15', rateAfter: percent('30') })).toThrow(RangeError);
  });
});
