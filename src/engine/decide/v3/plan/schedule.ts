// Payment schedules for v3 plans (05.1 D-01, D-04, D-05, D-19, D-24). Calls payoff/amortise; never re-implements it.
// Scaled-APR technique (RESEARCH Pattern 3): amortise at base 52 or 12 with apr x every.
// Schedule.totalInterest counts the pause interest too, so totalPaid - fees === financed + totalInterest.
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { amortise, amortiseDue } from '../../../payoff/amortise';
import { minorFromBigInt, rateDenominator, type Percent } from '../../../payoff/types';
import { MAX_OCCURRENCES_PER_CALL } from '../../../recurring/schedule';
import { cadenceDate } from '../dates';
import { MAX_PLAN_PERIODS } from '../constants';
import type { Cadence, FirstPayment, LocalDate, PlanFees, Schedule } from '../types';
import { amortBase, assertCadence, monthlyEquivalentOf, scaledApr } from './cadence';

const FN = 'buildSchedule';

export interface ScheduleInput {
  readonly asOf: LocalDate;
  readonly financed: MinorUnits;
  readonly apr: Percent;
  readonly cadence: Cadence;
  readonly count: number | null;
  readonly firstPayment: FirstPayment | null;
  readonly fees: PlanFees;
}

export type ScheduleOutcome =
  | { readonly ok: true; readonly schedule: Schedule }
  | {
      readonly ok: false;
      readonly missing: 'first_payment_not_chosen' | 'pause_interest_not_answered' | 'plan_count_missing';
    };

function assertFees(fees: PlanFees): void {
  for (const [k, v] of [['setup', fees.setup], ['perPeriod', fees.perPeriod], ['end', fees.end]] as const) {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new RangeError(`${FN}: fee ${k} ${v} must be a non-negative integer`);
    }
  }
}

/** Largest k with cadenceDate(asOf, c, k) <= firstDate: the full periods that pass before the first payment. */
function periodsBefore(asOf: string, c: Cadence, firstDate: string): number {
  let k = 0;
  while (cadenceDate(asOf, c, k + 1) <= firstDate) {
    k++;
    if (k > MAX_OCCURRENCES_PER_CALL) {
      throw new RangeError(`${FN}: deferral spans more than ${MAX_OCCURRENCES_PER_CALL} periods`);
    }
  }
  return k;
}

export function buildSchedule(input: ScheduleInput): ScheduleOutcome {
  const { asOf, financed, apr, cadence, count, firstPayment, fees } = input;
  assertCadence(cadence, FN);
  assertFees(fees);
  if (count === null || count === 0) return { ok: false, missing: 'plan_count_missing' };
  if (!Number.isInteger(count) || count < 1 || count > MAX_PLAN_PERIODS) {
    throw new RangeError(`${FN}: count ${count} must be an integer from 1 to ${MAX_PLAN_PERIODS}`);
  }
  if (financed < 0) throw new RangeError(`${FN}: financed ${financed} must be >= 0`);
  if (apr < 0n) throw new RangeError(`${FN}: apr must be >= 0`);
  if (firstPayment === null) return { ok: false, missing: 'first_payment_not_chosen' };

  const base = amortBase(cadence);
  const rate = scaledApr(apr, cadence);
  let firstDate: LocalDate;
  let principal: MinorUnits = financed;
  let pauseInterest = 0n;
  let pausePeriods = 0;
  let due = true;

  if (firstPayment.kind === 'today') {
    firstDate = asOf;
  } else if (firstPayment.kind === 'one_period') {
    firstDate = cadenceDate(asOf, cadence, 1);
    due = false;
  } else {
    firstDate = firstPayment.firstDate;
    // cadenceDate(asOf, c, 0) validates asOf; the first payment cannot be before today.
    if (firstDate < cadenceDate(asOf, cadence, 0)) {
      throw new RangeError(`${FN}: firstDate ${firstDate} is before ${asOf}`);
    }
    if (firstPayment.interestDuringPause === null) {
      return { ok: false, missing: 'pause_interest_not_answered' };
    }
    if (firstPayment.interestDuringPause && rate > 0n) {
      const k = periodsBefore(asOf, cadence, firstDate);
      pausePeriods = k;
      const D = rateDenominator(base);
      let bal = BigInt(financed);
      for (let i = 0; i < k; i++) bal += divideHalfUp(bal * rate, D);
      pauseInterest = bal - BigInt(financed);
      principal = minorFromBigInt(bal, FN);
    }
  }

  const r = due ? amortiseDue(principal, rate, count, base) : amortise(principal, rate, count, base);
  const lastPaying = r.months;
  const feeTotal = BigInt(fees.perPeriod) * BigInt(lastPaying) + BigInt(fees.end);
  const schedule: Schedule = {
    cadence,
    count,
    payment: r.payment,
    finalPayment: r.finalPayment,
    lastPaying,
    firstDate,
    financed,
    pauseInterest: minorFromBigInt(pauseInterest, FN),
    totalPaid: minorFromBigInt(BigInt(r.totalPaid) + feeTotal, FN),
    totalInterest: minorFromBigInt(BigInt(r.totalInterest) + pauseInterest, FN),
    fees,
    monthlyEquivalent: monthlyEquivalentOf(minorFromBigInt(BigInt(r.payment) + BigInt(fees.perPeriod), FN), cadence),
    source: 'computed',
    exactInterestBp: exactInterestBp({ apr: rate, count, base, due, pausePeriods }),
  };
  return { ok: true, schedule };
}

/** D-138: a share in basis points above this reads as this (it is far past any line, and stays a safe integer). */
export const EXACT_INTEREST_BP_CAP = 1_000_000_000;

/**
 * 05.4 D-138 (owner, 2026-11-05): the total interest a plan would cost with no rounding to the minor unit, as a share of the amount
 * borrowed, in whole basis points rounded down. Integer maths only. With r = apr / D a period (D = rateDenominator(base), A = D + apr):
 * - paid in arrears, total paid / amount = n x apr x A^n / (D x (A^n - D^n));
 * - first payment on the day (annuity-due), n x apr x A^(n-1) / (A^n - D^n);
 * - interest building up over k paused periods multiplies either by A^k / D^k.
 * The share = total paid / amount - 1; it does not depend on the amount, so a cheaper price can never cross the 10% line alone (I9).
 * 0 at 0%. Capped at EXACT_INTEREST_BP_CAP.
 */
export function exactInterestBp(p: { readonly apr: bigint; readonly count: number; readonly base: 52 | 12; readonly due: boolean; readonly pausePeriods: number }): number {
  if (p.apr <= 0n) return 0;
  const D = rateDenominator(p.base);
  const A = D + p.apr;
  const n = BigInt(p.count);
  const k = BigInt(p.pausePeriods);
  const An = A ** n;
  const Dn = D ** n;
  const num = n * p.apr * (p.due ? A ** (n - 1n) : An) * A ** k;
  const den = (p.due ? 1n : D) * (An - Dn) * D ** k;
  const bp = (num * 10_000n) / den - 10_000n;
  if (bp <= 0n) return 0;
  return bp > BigInt(EXACT_INTEREST_BP_CAP) ? EXACT_INTEREST_BP_CAP : Number(bp);
}

export function paymentDates(s: Schedule): readonly string[] {
  const out: string[] = [];
  for (let n = 0; n < s.lastPaying; n++) out.push(cadenceDate(s.firstDate, s.cadence, n));
  return out;
}

/**
 * D-68 window: true when the plan's last payment is dated before `toExclusive`.
 * - The engine's own payment (`computed`, and `from_quote`, whose periods are still the 0% walk's) is rounded up to the cent
 *   (D-64), so a tiny plan can clear a period early; reading `lastPaying` there let a dearer plan land inside the window while
 *   a cheaper one did not (I9, seed -1745555528). Those read the payments the person chose (`count`), which do not move with price.
 * - A quoted payment larger than the engine's (`quoted`, L-09) really pays the plan off early, so it keeps its real last payment
 *   (`lastPaying`). Owner decision 2026-11-12: "rounding only".
 */
export function lastPaymentBefore(s: Schedule, toExclusive: string): boolean {
  const last = s.source === 'quoted' ? s.lastPaying : s.count;
  return cadenceDate(s.firstDate, s.cadence, last - 1) < toExclusive;
}

/** Dated payments with the per-period fee on each and the end fee on the last. */
export function paymentsInRange(
  s: Schedule,
  fromInclusive: string,
  toExclusive: string
): readonly { readonly date: string; readonly amount: MinorUnits }[] {
  const out: { date: string; amount: MinorUnits }[] = [];
  for (let n = 0; n < s.lastPaying; n++) {
    const date = cadenceDate(s.firstDate, s.cadence, n);
    if (date >= toExclusive) break;
    if (date < fromInclusive) continue;
    const last = n === s.lastPaying - 1;
    const base = BigInt(last ? s.finalPayment : s.payment) + BigInt(s.fees.perPeriod) + (last ? BigInt(s.fees.end) : 0n);
    out.push({ date, amount: minorFromBigInt(base, 'paymentsInRange') });
  }
  return out;
}

/** [{count: lastPaying - 1, amount: payment}, {count: 1, amount: finalPayment}], merged when equal. */
export function scheduleLines(s: Schedule): readonly { readonly count: number; readonly amount: MinorUnits }[] {
  if (s.lastPaying < 1) return [];
  if (s.lastPaying === 1) return [{ count: 1, amount: s.finalPayment }];
  if (s.payment === s.finalPayment) return [{ count: s.lastPaying, amount: s.payment }];
  return [
    { count: s.lastPaying - 1, amount: s.payment },
    { count: 1, amount: s.finalPayment },
  ];
}
