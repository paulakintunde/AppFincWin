// 08.1-11 FIN-12: a "0% if paid in full" plan, costed. The plan's payments are the 0% plan's; the deal gives no interest only when the
// balance is cleared by the promotion's end date. When the plan's payments finish after it, the rate stated for that case is charged
// back from day one:
// - each payment period up to the end date, the rate's interest on the balance left before that period's payment is added up
//   (interest does not compound before the end date; a payment taken off the balance first lowers the next period's);
// - that back-charge lands on the end date, on top of what is still owed;
// - the same payments then carry on at the stated rate until nothing is owed.
// "Can it clear in time" is the plan's own payments: the last of them falls on or before the end date (owner, 2026-11-20).
// Integer maths only; interest rounds half up to the minor unit each period, as the payoff walk does.
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt, rateDenominator, type Percent } from '../../../payoff/types';
import { cadenceDate } from '../dates';
import { MAX_PLAN_PERIODS } from '../constants';
import type { LocalDate, Schedule } from '../types';
import { amortBase, monthlyEquivalentOf } from './cadence';
import { periodicRateFor } from './rateConvention';
import { periodsBefore } from './schedule';

const FN = 'deferredInterest';

export type DeferredOutcome =
  | { readonly kind: 'cleared'; readonly endDate: LocalDate }
  | { readonly kind: 'back_charge'; readonly endDate: LocalDate; readonly backCharge: MinorUnits; readonly schedule: Schedule };

export interface DeferredInput {
  readonly asOf: LocalDate;
  /** The 0% plan's schedule (payments, dates, financed). */
  readonly schedule: Schedule;
  readonly promoEnd: LocalDate;
  /** The rate charged back when the balance is not cleared by promoEnd. */
  readonly rateAfter: Percent;
  readonly country?: string | null;
}

export function deferredInterest(input: DeferredInput): DeferredOutcome {
  const { asOf, schedule: s, promoEnd } = input;
  const lastDate = cadenceDate(s.firstDate, s.cadence, s.lastPaying - 1);
  if (lastDate <= promoEnd) return { kind: 'cleared', endDate: promoEnd };

  const rate = periodicRateFor(input.rateAfter, s.cadence, input.country ?? null);
  const D = rateDenominator(amortBase(s.cadence));
  const periodInterest = (bal: bigint): bigint => divideHalfUp(bal * rate, D);

  let bal = BigInt(s.financed);
  let backCharge = 0n;
  let n = 0;
  // Payments dated on or before the end date. Periods run from day one; the first payment's wait is the whole periods before it.
  while (n < s.lastPaying && cadenceDate(s.firstDate, s.cadence, n) <= promoEnd) {
    const elapsed = n === 0 ? periodsBefore(asOf, s.cadence, s.firstDate) : 1;
    backCharge += BigInt(elapsed) * periodInterest(bal);
    bal -= BigInt(s.payment); // the last payment is dated after the end date (else it cleared), so every one here is the full payment
    n++;
  }
  // The end date falls before the first payment: the whole periods from day one to it are charged on the full balance.
  if (n === 0) backCharge = BigInt(periodsBefore(asOf, s.cadence, promoEnd)) * periodInterest(bal);

  // The back-charge lands now; the same payments carry on at the stated rate.
  let owed = bal + backCharge;
  let postInterest = 0n;
  let paid = BigInt(s.financed) - bal; // payments so far
  let last = n;
  let finalPayment = BigInt(s.payment);
  const pay = BigInt(s.payment);
  while (owed > 0n) {
    if (last >= MAX_PLAN_PERIODS) throw new RangeError(`${FN}: the payments do not pay the plan off`);
    const i = periodInterest(owed);
    owed += i;
    postInterest += i;
    const p = owed < pay ? owed : pay;
    owed -= p;
    paid += p;
    finalPayment = p;
    last++;
  }
  const interest = backCharge + postInterest;
  const feeTotal = BigInt(s.fees.perPeriod) * BigInt(last) + BigInt(s.fees.end);
  // The exact-share figure belongs to the 0% walk; the 10% test reads totalInterest instead (as with a quoted payment).
  const { exactInterestBp: _zeroWalk, ...rest } = s;
  const schedule: Schedule = {
    ...rest,
    count: last,
    lastPaying: last,
    finalPayment: minorFromBigInt(finalPayment, FN),
    totalPaid: minorFromBigInt(paid + feeTotal, FN),
    totalInterest: minorFromBigInt(interest, FN),
    monthlyEquivalent: monthlyEquivalentOf(minorFromBigInt(pay + BigInt(s.fees.perPeriod), FN), s.cadence),
  };
  return { kind: 'back_charge', endDate: promoEnd, backCharge: minorFromBigInt(backCharge, FN), schedule };
}
