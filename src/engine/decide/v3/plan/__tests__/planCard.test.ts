import fc from 'fast-check';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { ZERO_PERCENT, percent } from '../../../../payoff/types';
import { salesTaxAmount } from '../../../checkInputs';
import type { PlanFees, Schedule } from '../../types';
import { MONTHLY, QUARTERLY } from '../cadence';
import { planCard, salesTaxOf } from '../planCard';
import { buildSchedule, paymentsInRange } from '../schedule';

const m = minorUnits;
const ASOF = '2026-10-26';

function sched(over: Partial<Schedule>): Schedule {
  return {
    cadence: MONTHLY,
    count: 24,
    payment: m(8500),
    finalPayment: m(8462),
    lastPaying: 24,
    firstDate: '2026-11-26',
    financed: m(203000),
    pauseInterest: m(0),
    totalPaid: m(204962),
    totalInterest: m(1962),
    fees: { setup: m(0), perPeriod: m(0), end: m(0) },
    monthlyEquivalent: m(8500),
    source: 'computed',
    ...over,
  };
}

describe('planCard', () => {
  it('D-05 card lines: N x payment, then final; equal final merges', () => {
    const c = planCard({ price: m(200000), tax: m(0), oneOffFees: m(0), schedule: sched({}), runningMonthly: m(0) });
    expect(c.lines).toEqual([{ count: 23, amount: 8500 }, { count: 1, amount: 8462 }]);
    const eq = planCard({ price: m(1), tax: m(0), oneOffFees: m(0), schedule: sched({ finalPayment: m(8500) }), runningMonthly: m(0) });
    expect(eq.lines).toEqual([{ count: 24, amount: 8500 }]);
  });

  it('plan total is exact against the dated payments', () => {
    const fees: PlanFees = { setup: m(500), perPeriod: m(150), end: m(300) };
    const price = 200000;
    const tax = 16500;
    const oneOff = 2500;
    const o = buildSchedule({
      asOf: ASOF,
      financed: m(price + tax + oneOff),
      apr: percent('9.9'),
      cadence: MONTHLY,
      count: 24,
      firstPayment: { kind: 'one_period' },
      fees,
    });
    if (!o.ok) throw new Error('not ok');
    const s = o.schedule;
    const run = m(4000);
    const c = planCard({ price: m(price), tax: m(tax), oneOffFees: m(oneOff), schedule: s, runningMonthly: run });
    expect(c.total).toBe(price + tax + oneOff + s.totalInterest + 500 + 150 * s.lastPaying + 300);
    const paid = paymentsInRange(s, '0000-01-01', '9999-12-31').reduce((a, p) => a + p.amount, 0);
    expect(c.total).toBe(paid + 500);
    expect(c.runningMonthly).toBe(run);
    expect(c.endDate).toBe(paymentsInRange(s, '0000-01-01', '9999-12-31').at(-1)?.date);
  });

  it('plan total with a pause counts the pause interest once', () => {
    const o = buildSchedule({
      asOf: ASOF,
      financed: m(100000),
      apr: percent('12'),
      cadence: MONTHLY,
      count: 12,
      firstPayment: { kind: 'deferred', firstDate: '2027-01-26', interestDuringPause: true },
      fees: { setup: m(0), perPeriod: m(0), end: m(0) },
    });
    if (!o.ok) throw new Error('not ok');
    const s = o.schedule;
    expect(s.pauseInterest).toBeGreaterThan(0);
    const c = planCard({ price: m(100000), tax: m(0), oneOffFees: m(0), schedule: s, runningMonthly: m(0) });
    expect(c.total).toBe(s.totalPaid);
    expect(c.interest).toBe(s.totalInterest);
  });

  it('D-01 monthly line: $300 every 3 months is about $100 a month', () => {
    const c = planCard({
      price: m(30000),
      tax: m(0),
      oneOffFees: m(0),
      schedule: sched({ cadence: QUARTERLY, payment: m(30000), finalPayment: m(30000), lastPaying: 4, count: 4, monthlyEquivalent: m(10000) }),
      runningMonthly: m(0),
    });
    expect(c.monthlyEquivalent).toBe(10000);
    expect(c.cadence).toEqual(QUARTERLY);
    expect(c.lines).toEqual([{ count: 4, amount: 30000 }]);
    expect(c.endDate).toBe('2027-08-26');
  });

  it('zero rate card has no interest', () => {
    const o = buildSchedule({
      asOf: ASOF, financed: m(240000), apr: ZERO_PERCENT, cadence: MONTHLY, count: 12,
      firstPayment: { kind: 'today' }, fees: { setup: m(0), perPeriod: m(0), end: m(0) },
    });
    if (!o.ok) throw new Error('not ok');
    const c = planCard({ price: m(240000), tax: m(0), oneOffFees: m(0), schedule: o.schedule, runningMonthly: m(0) });
    expect(c.interest).toBe(0);
    expect(c.total).toBe(240000);
    expect(c.firstDate).toBe(ASOF);
  });
});

describe('salesTaxOf parity with checkInputs.salesTaxAmount', () => {
  it('matches for 100 samples; null is 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (n) => {
        const a: MinorUnits = m(n);
        return salesTaxOf(a, percent('8.25')) === salesTaxAmount(a, percent('8.25'));
      }),
      { numRuns: 100 }
    );
    expect(salesTaxOf(m(12345), null)).toBe(0);
    expect(() => salesTaxOf(m(1), -1n as never)).toThrow(RangeError);
  });
});
