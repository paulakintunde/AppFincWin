import fc from 'fast-check';
import { divideHalfUp } from '../../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { amortise, amortiseDue } from '../../../../payoff/amortise';
import { PERCENT_SCALE, ZERO_PERCENT, percent, percentFromScaled, rateDenominator } from '../../../../payoff/types';
import type { Cadence, PlanFees, Schedule } from '../../types';
import { BIWEEKLY, MONTHLY, QUARTERLY, WEEKLY, scaledApr } from '../cadence';
import { EXACT_INTEREST_BP_CAP, buildSchedule, exactInterestBp, paymentDates, paymentsInRange, scheduleLines, type ScheduleInput } from '../schedule';

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

  it('rejects bad fees, a negative financed amount or rate, and a deferral that is too long', () => {
    const neg = (n: number): MinorUnits => n as MinorUnits;
    expect(() => buildSchedule(input({ fees: { ...NO_FEES, end: neg(-1) } }))).toThrow(RangeError);
    expect(() => buildSchedule(input({ fees: { ...NO_FEES, perPeriod: neg(1.5) } }))).toThrow(RangeError);
    expect(() => buildSchedule(input({ financed: neg(-1) }))).toThrow(RangeError);
    expect(() => buildSchedule(input({ apr: -1n as ReturnType<typeof percent> }))).toThrow(RangeError);
    expect(() =>
      buildSchedule(
        input({ cadence: WEEKLY, apr: percent('10'), firstPayment: { kind: 'deferred', firstDate: '2070-01-01', interestDuringPause: true } })
      )
    ).toThrow('deferral spans');
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

describe('D-138 exactInterestBp: the interest before rounding, as a share of the amount (owner, 2026-11-05)', () => {
  const pct = (n: number): bigint => BigInt(n) * PERCENT_SCALE;

  it('matches the textbook annuity at 1% a month over 12 payments (hand figures)', () => {
    // arrears: 12 x 0.01 x 1.01^12 / (1.01^12 - 1) = 1.066185...; due: that / 1.01 = 1.055628...; two paused periods: x 1.01^2 = 1.087615...
    expect(exactInterestBp({ apr: pct(12), count: 12, base: 12, due: false, pausePeriods: 0 })).toBe(661);
    expect(exactInterestBp({ apr: pct(12), count: 12, base: 12, due: true, pausePeriods: 0 })).toBe(556);
    expect(exactInterestBp({ apr: pct(12), count: 12, base: 12, due: false, pausePeriods: 2 })).toBe(876);
    expect(exactInterestBp({ apr: pct(52), count: 26, base: 52, due: false, pausePeriods: 0 })).toBe(1405);
  });

  it('0% and a share that rounds down to 0 give 0; an absurd rate is capped', () => {
    expect(exactInterestBp({ apr: 0n, count: 12, base: 12, due: false, pausePeriods: 0 })).toBe(0);
    expect(exactInterestBp({ apr: 1n, count: 1, base: 12, due: false, pausePeriods: 0 })).toBe(0);
    expect(exactInterestBp({ apr: 10n ** 30n, count: 12, base: 12, due: false, pausePeriods: 0 })).toBe(EXACT_INTEREST_BP_CAP);
  });

  it('I9-ROUNDING: $1.00 and $1.01 share one exact figure (9.32%) though their rounded interest differs', () => {
    const plan = (financed: number) => buildSchedule(input({ financed: minorUnits(financed), apr: percent('11'), cadence: { unit: 'month', every: 2 }, count: 11, firstPayment: { kind: 'today' } }));
    const lo = plan(100);
    const hi = plan(101);
    if (!lo.ok || !hi.ok) throw new Error('schedule');
    expect([lo.schedule.totalInterest, hi.schedule.totalInterest]).toEqual([10, 8]);
    expect([lo.schedule.exactInterestBp, hi.schedule.exactInterestBp]).toEqual([932, 932]);
  });

  it('a schedule with interest during a pause counts the paused periods', () => {
    const r = buildSchedule(input({ apr: percent('12'), count: 12, firstPayment: { kind: 'deferred', firstDate: '2026-12-26', interestDuringPause: true } }));
    const flat = buildSchedule(input({ apr: percent('12'), count: 12, firstPayment: { kind: 'deferred', firstDate: '2026-12-26', interestDuringPause: false } }));
    if (!r.ok || !flat.ok) throw new Error('schedule');
    expect(flat.schedule.exactInterestBp).toBe(556);
    expect(r.schedule.exactInterestBp).toBeGreaterThan(556);
  });
});

describe('schedule.ts mutation kills (05.4-58)', () => {
  const MAX = Number.MAX_SAFE_INTEGER;

  it('every refusal names the function and the figure', () => {
    expect(() => buildSchedule(input({ fees: { ...NO_FEES, setup: minorUnits(-1) } }))).toThrow('buildSchedule: fee setup -1 must be a non-negative integer');
    expect(() => buildSchedule(input({ financed: minorUnits(-5) }))).toThrow('buildSchedule: financed -5 must be >= 0');
    expect(() => buildSchedule(input({ apr: -1n as never }))).toThrow('buildSchedule: apr must be >= 0');
    expect(() => buildSchedule(input({ firstPayment: { kind: 'deferred', firstDate: '2026-10-25', interestDuringPause: false } }))).toThrow('buildSchedule: firstDate 2026-10-25 is before 2026-10-26');
  });

  it.each([1.5, -1, 601, Number.NaN])('a count of %s is refused', (count) => {
    expect(() => buildSchedule(input({ count }))).toThrow(/^buildSchedule: count .* must be an integer from 1 to 600$/);
  });

  it('the first and the last allowed count build', () => {
    expect(build({ count: 1 }).lastPaying).toBe(1);
    expect(build({ count: 600 }).count).toBe(600);
  });

  it('a bad cadence is refused before the missing count is reported', () => {
    expect(() => buildSchedule(input({ cadence: { unit: 'month', every: 0 }, count: null }))).toThrow(RangeError);
  });

  it('a first payment on the as-of day itself is allowed', () => {
    const s = build({ firstPayment: { kind: 'deferred', firstDate: ASOF, interestDuringPause: false } });
    expect(s.firstDate).toBe(ASOF);
  });

  it('interest during a wait is added only when the wait carries interest, and only with a rate', () => {
    const later = '2027-01-26';
    const none = build({ apr: percent('12'), firstPayment: { kind: 'deferred', firstDate: later, interestDuringPause: false } });
    expect(none.pauseInterest).toBe(0);
    const some = build({ apr: percent('12'), firstPayment: { kind: 'deferred', firstDate: later, interestDuringPause: true } });
    expect(some.pauseInterest).toBe(7_272);
    const zero = build({ apr: ZERO_PERCENT, firstPayment: { kind: 'deferred', firstDate: later, interestDuringPause: true } });
    expect(zero.pauseInterest).toBe(0);
  });

  it('a wait of 1000 weeks is the longest that builds; 1001 is refused', () => {
    const weekly = { unit: 'week', every: 1 } as const;
    const at = (days: number) => new Date(Date.UTC(2026, 9, 26 + days)).toISOString().slice(0, 10);
    const pause = (days: number) => ({ kind: 'deferred', firstDate: at(days), interestDuringPause: true }) as const;
    expect(build({ cadence: weekly, apr: percent('5'), firstPayment: pause(7_000) }).pauseInterest).toBeGreaterThan(0);
    expect(() => buildSchedule(input({ cadence: weekly, apr: percent('5'), firstPayment: pause(7_007) }))).toThrow('buildSchedule: deferral spans more than 1000 periods');
  });

  it('a fee per period is part of the monthly equivalent', () => {
    const s = build({ fees: { ...NO_FEES, perPeriod: minorUnits(500) } });
    expect(s.monthlyEquivalent).toBe(Number(s.payment) + 500);
  });

  it('exactInterestBp is 0 at 0%', () => {
    expect(exactInterestBp({ apr: 0n, count: 12, base: 12, due: false, pausePeriods: 0 })).toBe(0);
  });

  it('paymentDates lists exactly the payment dates', () => {
    expect(paymentDates(build({ count: 3 }))).toEqual(['2026-11-26', '2026-12-26', '2027-01-26']);
  });

  it('a payment too large for a safe integer names its function', () => {
    const s = { ...build({ count: 2 }), payment: minorUnits(MAX), finalPayment: minorUnits(MAX), fees: { ...NO_FEES, perPeriod: minorUnits(1) } } as Schedule;
    expect(() => paymentsInRange(s, '2026-11-01', '2027-12-31')).toThrow(/^paymentsInRange: /);
  });

  it('scheduleLines: none for no payments; one payment is the final amount', () => {
    const s = build({ count: 3 });
    expect(scheduleLines({ ...s, lastPaying: 0 })).toEqual([]);
    expect(scheduleLines({ ...s, lastPaying: 1, payment: minorUnits(100), finalPayment: minorUnits(70) })).toEqual([{ count: 1, amount: 70 }]);
  });
});
