/**
 * D-48: promotional and stepped rate schedules for one balance.
 *
 * A schedule is user data: segments starting at month 1, strictly ascending, each with a
 * user-entered APR (0 allowed), plus a user-entered deferred-interest flag. The engine never
 * pre-fills a promotional rate or infers the flag (D-07); there is no default rate anywhere here.
 *
 * Recast convention: at the start of each segment the remaining balance is re-amortised over the
 * remaining months at that segment's APR (ARM-style "recast at rate change", 04-RESEARCH addendum
 * assumption A6). A user whose lender quotes a fixed payment enters it as an instalment plan instead.
 * The final payment absorbs the rounding residual (D-20), so totalPaid === principal + totalInterest. Each recast
 * payment is amortise's D-64 level payment (rounded up), so within a segment no later payment exceeds it.
 *
 * Deferred interest (US Reg Z 1026.55(b)(1) comment 3.i and the CFPB explainer; UK FCA PS19/17):
 * while flagged, interest at the post-promo rate accrues on each promotional month's opening
 * balance. If a balance is still open when the promo ends, the accrued amount is added to it and
 * reported; if the balance was cleared first, nothing is charged.
 *
 * Scope: one balance per plan. Payment allocation across several balances (Reg Z 1026.53) and the
 * 60-days-late forfeiture of a deferred-interest promo are behaviour-dependent and out of scope.
 *
 * D-17 is unchanged by schedules: the never-clears check stays explicit and per month, separate from
 * the 600-month cap. A 0% month cannot trip it unless the payment rounds to 0 (the same honest integer
 * outcome as simulateMinimum). Minimum payments during a promo use the card's own formula with no
 * interest component (04-RESEARCH addendum section C).
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { amortise } from './amortise';
import { MAX_TERM_MONTHS, SIMULATION_MONTH_CAP } from './constants';
import {
  MONTHLY_RATE_DENOMINATOR,
  ONE_HUNDRED_PERCENT,
  minorFromBigInt,
  type AmortisationResult,
  type CardMinimumTerms,
  type MinimumPaymentResult,
  type Percent,
} from './types';

export interface RateSegment {
  /** 1-based month the segment starts. */
  readonly fromMonth: number;
  readonly apr: Percent;
}

export interface RateSchedule {
  readonly segments: readonly RateSegment[];
  /** User-entered, never inferred. */
  readonly deferredInterest: boolean;
}

export interface ScheduledAmortisation extends AmortisationResult {
  readonly paymentsByMonth: readonly MinorUnits[];
  readonly balancesByMonth: readonly MinorUnits[];
  readonly highestPayment: MinorUnits;
  readonly promoMonths: number;
  /** Balance after month min(promoMonths, months), before any deferred charge; principal when promoMonths is 0. */
  readonly balanceAtPromoEnd: MinorUnits;
  /** Interest charged in months after the promo, plus deferredInterestCharged. */
  readonly interestAfterPromo: MinorUnits;
  readonly deferredInterestCharged: MinorUnits;
}

export interface ScheduledMinimumResult extends MinimumPaymentResult {
  readonly paymentsByMonth: readonly MinorUnits[];
  readonly balancesByMonth: readonly MinorUnits[];
  readonly highestPayment: MinorUnits;
  readonly promoMonths: number;
  /** The payment in month promoMonths + 1; null when the simulation never reached that month. */
  readonly paymentAfterPromo: MinorUnits | null;
  readonly clearedBeforePromoEnd: boolean;
  /** null for never_clears. */
  readonly interestAfterPromo: MinorUnits | null;
  readonly deferredInterestCharged: MinorUnits;
}

export function singleRate(apr: Percent): RateSchedule {
  return { segments: [{ fromMonth: 1, apr }], deferredInterest: false };
}

export function assertValidSchedule(schedule: RateSchedule, fn: string): void {
  const { segments } = schedule;
  if (segments.length === 0) {
    throw new RangeError(`${fn}: rate schedule needs at least one segment`);
  }
  if (segments[0]!.fromMonth !== 1) {
    throw new RangeError(`${fn}: the first rate segment must start at month 1`);
  }
  let previous = 0;
  for (const seg of segments) {
    if (!Number.isSafeInteger(seg.fromMonth)) {
      throw new RangeError(`${fn}: segment start ${seg.fromMonth} must be an integer`);
    }
    if (seg.fromMonth <= previous) {
      throw new RangeError(`${fn}: segment starts must be strictly ascending`);
    }
    if (seg.apr < 0n) {
      throw new RangeError(`${fn}: segment APR must be >= 0`);
    }
    previous = seg.fromMonth;
  }
  if (schedule.deferredInterest) {
    if (segments.length < 2) {
      throw new RangeError(`${fn}: deferred interest needs a promotional segment before the post-promo rate`);
    }
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i]!.apr !== 0n) {
        throw new RangeError(`${fn}: deferred interest needs a 0% promotional rate`);
      }
    }
  }
}

/** Months before the last segment starts (0 for a single segment). */
export function promoMonthsOf(schedule: RateSchedule): number {
  return schedule.segments[schedule.segments.length - 1]!.fromMonth - 1;
}

function maxOf(values: readonly bigint[]): bigint {
  let max = 0n;
  for (const v of values) {
    if (v > max) max = v;
  }
  return max;
}

export function amortiseSchedule(principal: MinorUnits, schedule: RateSchedule, months: number): ScheduledAmortisation {
  const FN = 'amortiseSchedule';
  if (!Number.isInteger(months) || months < 1 || months > MAX_TERM_MONTHS) {
    throw new RangeError(`${FN}: months ${months} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }
  if (principal < 0) {
    throw new RangeError(`${FN}: principal ${principal} must be >= 0`);
  }
  assertValidSchedule(schedule, FN);

  const D = MONTHLY_RATE_DENOMINATOR;
  const { segments, deferredInterest } = schedule;
  const promoEnd = promoMonthsOf(schedule);
  const postApr = segments[segments.length - 1]!.apr;

  let bal = BigInt(principal);
  let balanceAtPromoEnd = bal;
  let shadow = 0n;
  let charged = 0n;
  let payment = 0n;
  let segIdx = 0;
  let totalInterest = 0n;
  let interestAfter = 0n;
  const payments: bigint[] = [];
  const balances: bigint[] = [];

  for (let k = 1; k <= months; k++) {
    let segStart = k === 1;
    while (segIdx + 1 < segments.length && segments[segIdx + 1]!.fromMonth <= k) {
      segIdx += 1;
      segStart = true;
    }
    const apr = segments[segIdx]!.apr;
    if (segStart) {
      if (deferredInterest && k === promoEnd + 1 && bal > 0n) {
        bal += shadow;
        charged = shadow;
      }
      // Recast: re-amortise the remaining balance over the remaining months.
      payment = BigInt(amortise(minorFromBigInt(bal, FN), apr, months - k + 1).payment);
    }
    if (deferredInterest && k <= promoEnd) {
      // On the opening balance (CFPB: "balance you owed in each month"); nothing accrues on repaid amounts.
      shadow += divideHalfUp(bal * postApr, D);
    }
    const interest = divideHalfUp(bal * apr, D);
    const due = bal + interest;
    // D-20: the final payment absorbs the residual.
    const paid = k === months ? due : payment < due ? payment : due;
    bal = due - paid;
    totalInterest += interest;
    if (k > promoEnd) interestAfter += interest;
    payments.push(paid);
    balances.push(bal);
    if (k <= promoEnd) balanceAtPromoEnd = bal;
  }
  totalInterest += charged;
  interestAfter += charged;

  const totalPaid = payments.reduce((s, p) => s + p, 0n);
  return {
    payment: minorFromBigInt(payments[0]!, FN),
    finalPayment: minorFromBigInt(payments[months - 1]!, FN),
    months,
    totalPaid: minorFromBigInt(totalPaid, FN),
    totalInterest: minorFromBigInt(totalInterest, FN),
    paymentsByMonth: payments.map((p) => minorFromBigInt(p, FN)),
    balancesByMonth: balances.map((b) => minorFromBigInt(b, FN)),
    highestPayment: minorFromBigInt(maxOf(payments), FN),
    promoMonths: promoEnd,
    balanceAtPromoEnd: minorFromBigInt(balanceAtPromoEnd, FN),
    interestAfterPromo: minorFromBigInt(interestAfter, FN),
    deferredInterestCharged: minorFromBigInt(charged, FN),
  };
}

export function simulateMinimumSchedule(
  balance: MinorUnits,
  schedule: RateSchedule,
  terms: CardMinimumTerms
): ScheduledMinimumResult {
  const FN = 'simulateMinimumSchedule';
  if (balance < 0) {
    throw new RangeError(`${FN}: balance must be >= 0`);
  }
  assertValidSchedule(schedule, FN);

  const D = MONTHLY_RATE_DENOMINATOR;
  const { segments, deferredInterest } = schedule;
  const promoEnd = promoMonthsOf(schedule);
  const postApr = segments[segments.length - 1]!.apr;
  const floor = BigInt(terms.floor);

  let bal = BigInt(balance);
  let shadow = 0n;
  let charged = 0n;
  let segIdx = 0;
  let totalInterest = 0n;
  let interestAfter = 0n;
  let first = 0n;
  let month = 0;
  const payments: bigint[] = [];
  const balances: bigint[] = [];

  const finish = (outcome: MinimumPaymentResult['outcome'], remaining: bigint): ScheduledMinimumResult => {
    const neverClears = outcome === 'never_clears';
    return {
      outcome,
      months: month,
      firstPayment: minorFromBigInt(first, FN),
      totalInterest: neverClears ? null : minorFromBigInt(totalInterest + charged, FN),
      remainingBalance: minorFromBigInt(remaining, FN),
      paymentsByMonth: payments.map((p) => minorFromBigInt(p, FN)),
      balancesByMonth: balances.map((b) => minorFromBigInt(b, FN)),
      highestPayment: minorFromBigInt(maxOf(payments), FN),
      promoMonths: promoEnd,
      paymentAfterPromo: payments.length > promoEnd ? minorFromBigInt(payments[promoEnd]!, FN) : null,
      clearedBeforePromoEnd: outcome === 'cleared' && month <= promoEnd,
      interestAfterPromo: neverClears ? null : minorFromBigInt(interestAfter + charged, FN),
      deferredInterestCharged: minorFromBigInt(charged, FN),
    };
  };

  while (bal > 0n) {
    if (month === SIMULATION_MONTH_CAP) {
      return finish('exceeds_month_cap', bal);
    }
    const k = month + 1;
    while (segIdx + 1 < segments.length && segments[segIdx + 1]!.fromMonth <= k) {
      segIdx += 1;
    }
    const apr = segments[segIdx]!.apr;
    if (deferredInterest && k === promoEnd + 1) {
      bal += shadow;
      charged = shadow;
    }
    if (deferredInterest && k <= promoEnd) {
      shadow += divideHalfUp(bal * postApr, D);
    }
    const interest = divideHalfUp(bal * apr, D);
    const percentPart = divideHalfUp(bal * terms.minimumPercent, ONE_HUNDRED_PERCENT);
    const base = terms.interestAdded ? percentPart + interest : percentPart;
    const scheduled = base > floor ? base : floor;
    const due = bal + interest;
    const paid = scheduled < due ? scheduled : due;
    if (month === 0) first = paid;
    month = k;
    payments.push(paid);
    // D-17: explicit, per-month check, independent of the cap.
    if (paid <= interest) {
      balances.push(bal);
      return finish('never_clears', bal);
    }
    totalInterest += interest;
    if (k > promoEnd) interestAfter += interest;
    bal = due - paid;
    balances.push(bal);
  }
  return finish('cleared', 0n);
}
