// The whole-plan card numbers (05.1 D-05, D-01, v3 §3.6). Price, tax, fees, interest, the total and
// "N x payment, then final", with the monthly equivalent and the end date. The schedule is on the FULL lender amount.
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { ONE_HUNDRED_PERCENT, minorFromBigInt, type Percent } from '../../../payoff/types';
import type { Cadence, Schedule } from '../types';
import { paymentDates, scheduleLines } from './schedule';

const FN = 'planCard';

export interface PlanCard {
  readonly price: MinorUnits;
  readonly tax: MinorUnits;
  readonly oneOffFees: MinorUnits;
  readonly interest: MinorUnits;
  readonly fees: MinorUnits;
  readonly runningMonthly: MinorUnits;
  readonly total: MinorUnits;
  readonly lines: readonly { readonly count: number; readonly amount: MinorUnits }[];
  readonly cadence: Cadence;
  readonly monthlyEquivalent: MinorUnits;
  readonly firstDate: string;
  readonly endDate: string;
  readonly source: Schedule['source'];
}

export interface PlanCardInput {
  readonly price: MinorUnits;
  readonly tax: MinorUnits;
  readonly oneOffFees: MinorUnits;
  readonly schedule: Schedule;
  readonly runningMonthly: MinorUnits;
}

/** Sales tax on the advertised price, half-up. 0 when no tax rate is set. */
export function salesTaxOf(advertised: MinorUnits, taxPercent: Percent | null): MinorUnits {
  if (taxPercent === null) return minorFromBigInt(0n, 'salesTaxOf');
  if (taxPercent < 0n) throw new RangeError(`salesTaxOf: tax percent ${taxPercent} must be >= 0`);
  return minorFromBigInt(divideHalfUp(BigInt(advertised) * taxPercent, ONE_HUNDRED_PERCENT), 'salesTaxOf');
}

export function planCard(input: PlanCardInput): PlanCard {
  const { price, tax, oneOffFees, schedule: s, runningMonthly } = input;
  // totalInterest already includes the pause interest (schedule.ts header); adding pauseInterest would count it twice.
  const interest = s.totalInterest;
  const fees = minorFromBigInt(
    BigInt(s.fees.setup) + BigInt(s.fees.perPeriod) * BigInt(s.lastPaying) + BigInt(s.fees.end),
    FN
  );
  const total = minorFromBigInt(BigInt(price) + BigInt(tax) + BigInt(oneOffFees) + BigInt(interest) + BigInt(fees), FN);
  const dates = paymentDates(s);
  const endDate = dates.at(-1) ?? s.firstDate;
  return {
    price,
    tax,
    oneOffFees,
    interest,
    fees,
    runningMonthly,
    total,
    lines: scheduleLines(s),
    cadence: s.cadence,
    monthlyEquivalent: s.monthlyEquivalent,
    firstDate: s.firstDate,
    endDate,
    source: s.source,
  };
}
