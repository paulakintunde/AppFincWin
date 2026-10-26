import fc from 'fast-check';
import { divideHalfUp } from '../../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { amortise, amortiseDue } from '../../../../payoff/amortise';
import { PERCENT_SCALE, ZERO_PERCENT, percent, percentFromScaled, rateDenominator } from '../../../../payoff/types';
import type { Cadence, PlanFees, Schedule } from '../../types';
import { BIWEEKLY, MONTHLY, QUARTERLY, WEEKLY, scaledApr } from '../cadence';
import { buildSchedule, paymentsInRange, scheduleLines, type ScheduleInput } from '../schedule';

const NO_FEES: PlanFees = { setup: minorUnits(0), perPeriod: minorUnits(0), end: minorUnits(0) };
const ASOF = '2026-10-26';

function input(over: Partial<ScheduleInput>): ScheduleInput {
  return {
    asOf: ASOF,
    financed: minorUnits(240000),
    apr: ZERO_PERCENT,
    cadence: MONTHLY,
    count: 24,
    firstPayment: { kind: 'one_period' },
    fees: NO_FEES,
    ...over,
  };
}

function build(over: Partial<ScheduleInput>): Schedule {
  const o = buildSchedule(input(over));
  if (!o.ok) throw new Error(`not ok: ${o.missing}`);
  return o.schedule;
}

const aprArb = fc.bigInt({ min: 0n, max: 30n * PERCENT_SCALE }).map(percentFromScaled);
const principalArb = fc.integer({ min: 1, max: 1_000_000_000 }).map((n) => minorUnits(n));
const cadenceArb: fc.Arbitrary<Cadence> = fc.record({
  unit: fc.constantFrom('week' as const, 'month' as const),
  every: fc.integer({ min: 1, max: 12 }),
});

describe('buildSchedule', () => {
  it('A9 scaled APR equals native ppy', () => {
    fc.assert(
      fc.property(principalArb, aprArb, fc.integer({ min: 1, max: 120 }), (P, apr, n) => {
        expect(amortise(P, scaledApr(apr, BIWEEKLY), n, 52)).toEqual(amortise(P, apr, n, 26));
        expect(amortise(P, scaledApr(apr, QUARTERLY), n, 12)).toEqual(amortise(P, apr, n, 4));
        expect(amortiseDue(P, scaledApr(apr, BIWEEKLY), n, 52)).toEqual(amortiseDue(P, apr, n, 26));
        expect(amortiseDue(P, scaledApr(apr, QUARTERLY), n, 12)).toEqual(amortiseDue(P, apr, n, 4));
      }),
      { numRuns: 100 }
    );
  });

  it('D-05 exact final payment', () => {
    fc.assert(
      fc.property(
        principalArb,
        aprArb,
        cadenceArb,
        fc.integer({ min: 1, max: 120 }),
        fc.constantFrom('today' as const, 'one_period' as const),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        (P, apr, cadence, count, kind, perPeriod, end) => {
          const fees: PlanFees = { setup: minorUnits(0), perPeriod: minorUnits(perPeriod), end: minorUnits(end) };
          const s = build({ financed: P, apr, cadence, count, firstPayment: { kind }, fees });
          const lhs = BigInt(s.payment) * BigInt(s.lastPaying - 1) + BigInt(s.finalPayment);
          const rhs = BigInt(s.totalPaid) - BigInt(perPeriod) * BigInt(s.lastPaying) - BigInt(end);
          expect(lhs).toBe(rhs);
          expect(rhs).toBe(BigInt(P) + BigInt(s.totalInterest));
          expect(s.finalPayment).toBeLessThanOrEqual(s.payment);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('D-05 example: 23 at 85.00 then 84.62', () => {
    const s: Schedule = {
      cadence: MONTHLY,
      count: 24,
      payment: minorUnits(8500),
      finalPayment: minorUnits(8462),
      lastPaying: 24,
      firstDate: ASOF,
      financed: minorUnits(203962),
      pauseInterest: minorUnits(0),
      totalPaid: minorUnits(203962),
      totalInterest: minorUnits(0),
      fees: NO_FEES,
      monthlyEquivalent: minorUnits(8500),
      source: 'computed',
    };
    expect(scheduleLines(s)).toEqual([
      { count: 23, amount: 8500 },
      { count: 1, amount: 8462 },
    ]);
    expect(scheduleLines({ ...s, finalPayment: s.payment })).toEqual([{ count: 24, amount: 8500 }]);
  });

  it('D-04 today uses amortiseDue and dates the first payment today', () => {
    const apr = percent('12');
    const s = build({ apr, firstPayment: { kind: 'today' } });
    expect(s.firstDate).toBe(ASOF);
    expect(s.payment).toBe(amortiseDue(minorUnits(240000), apr, 24, 12).payment);
  });

  it('D-04 one_period uses amortise and dates the first payment a period on', () => {
    const apr = percent('12');
    const s = build({ apr, firstPayment: { kind: 'one_period' } });
    expect(s.firstDate).toBe('2026-11-26');
    expect(s.payment).toBe(amortise(minorUnits(240000), apr, 24, 12).payment);
  });

  it('D-04 no silent default', () => {
    expect(buildSchedule(input({ firstPayment: null }))).toEqual({ ok: false, missing: 'first_payment_not_chosen' });
  });

  it('count missing and bounds', () => {
    expect(buildSchedule(input({ count: 0 }))).toEqual({ ok: false, missing: 'plan_count_missing' });
    expect(buildSchedule(input({ count: null }))).toEqual({ ok: false, missing: 'plan_count_missing' });
    expect(() => buildSchedule(input({ count: 601 }))).toThrow(RangeError);
    expect(() => buildSchedule(input({ count: 2.5 }))).toThrow(RangeError);
  });

  it('D-24 deferred, no interest: a true 0% pause', () => {
    const s = build({
      firstPayment: { kind: 'deferred', firstDate: '2027-04-26', interestDuringPause: false },
      apr: ZERO_PERCENT,
    });
    expect(s.payment).toBe(10000);
    expect(s.finalPayment).toBe(10000);
    expect(s.lastPaying).toBe(24);
    expect(s.pauseInterest).toBe(0);
    expect(s.totalPaid).toBe(240000);
    const pays = paymentsInRange(s, '1900-01-01', '2100-01-01');
    expect(pays).toHaveLength(24);
    expect(pays[0]!.date).toBe('2027-04-26');
    expect(paymentsInRange(s, ASOF, '2027-04-26')).toEqual([]);
  });

  it('D-24 deferred at a rate with no build-up charges nothing for the pause', () => {
    const apr = percent('12');
    const s = build({ apr, firstPayment: { kind: 'deferred', firstDate: '2027-04-26', interestDuringPause: false } });
    expect(s.pauseInterest).toBe(0);
    expect(s.payment).toBe(amortiseDue(minorUnits(240000), apr, 24, 12).payment);
  });

  it('D-24 deferred, interest builds up: capitalises per period at the entered rate', () => {
    const apr = percent('12');
    const s = build({ apr, firstPayment: { kind: 'deferred', firstDate: '2027-01-26', interestDuringPause: true } });
    const D = rateDenominator(12);
    let bal = 240000n;
    for (let i = 0; i < 3; i++) bal += divideHalfUp(bal * apr, D);
    expect(BigInt(s.pauseInterest)).toBe(bal - 240000n);
    expect(s.pauseInterest).toBeGreaterThan(0);
    expect(s.payment).toBe(amortiseDue(Number(bal) as MinorUnits, apr, 24, 12).payment);
    expect(s.financed).toBe(240000);
    expect(BigInt(s.totalPaid)).toBe(240000n + BigInt(s.totalInterest));
  });

  it('D-24 not answered', () => {
    expect(
      buildSchedule(input({ firstPayment: { kind: 'deferred', firstDate: '2027-04-26', interestDuringPause: null } }))
    ).toEqual({ ok: false, missing: 'pause_interest_not_answered' });
  });

  it('a deferred date before today throws', () => {
    expect(() =>
      buildSchedule(input({ firstPayment: { kind: 'deferred', firstDate: '2026-10-01', interestDuringPause: false } }))
    ).toThrow(RangeError);
  });

  it('paymentsInRange adds fees and sums to totalPaid', () => {
    const fees: PlanFees = { setup: minorUnits(500), perPeriod: minorUnits(150), end: minorUnits(900) };
    const s = build({ apr: percent('9.9'), cadence: WEEKLY, count: 30, fees });
    const all = paymentsInRange(s, '1900-01-01', '2100-01-01');
    expect(all).toHaveLength(s.lastPaying);
    expect(all.reduce((a, p) => a + p.amount, 0)).toBe(s.totalPaid);
    expect(all[all.length - 1]!.amount).toBe(s.finalPayment + 150 + 900);
    const slice = paymentsInRange(s, all[2]!.date, all[5]!.date);
    expect(slice.map((p) => p.date)).toEqual([all[2]!.date, all[3]!.date, all[4]!.date]);
  });

  it('every 4 weeks pays 13 times a year', () => {
    const s = build({ cadence: { unit: 'week', every: 4 }, count: 13, financed: minorUnits(130000) });
    expect(s.payment).toBe(10000);
    expect(s.monthlyEquivalent).toBe(Number(divideHalfUp(10000n * 52n, 48n)));
  });

  it('never throws across rates, cadences and counts to 600', () => {
    fc.assert(
      fc.property(
        principalArb,
        aprArb,
        cadenceArb,
        fc.integer({ min: 1, max: 600 }),
        fc.constantFrom('today' as const, 'one_period' as const),
        (P, apr, cadence, count, kind) => {
          expect(buildSchedule(input({ financed: P, apr, cadence, count, firstPayment: { kind } })).ok).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
    expect(build({ count: 600, apr: percent('30') }).lastPaying).toBeGreaterThan(0);
  });
});
