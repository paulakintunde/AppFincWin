import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff';
import { isValidLocalDate, monthOf } from '../time/localDate';
import { SIMULATION_MONTH_CAP } from './constants';
import { monthAfter } from './futureChanges';
import { monthlyStepsOf } from './plan';
import { myPart, type ResolvedShare } from './share';
import type { PaybackResult, PaymentStep, Plan, PurchaseIncomeChange } from './types';

const FN = 'paybackMonths';

/**
 * Payback months for a purchase that raises income (D-53, DEC-15).
 *
 * Only a positive expected income change has a payback, and it is reported beside the verdict, never in it. The count
 * is cumulative (04-REPLAN-NOTES 2026-10-15 expansion, default 7): the first month k where the cumulative extra income
 * reaches my day-one cost plus my payments to date plus my running costs to date. Interest is inside the payments, so
 * it is counted; loss of value is non-cash (D-55) and is not a cost here. Income counts only from its start month and
 * is mine (never shared); every cost term is my part under the purchase share (D-34).
 *
 * When the income does not catch up within `horizonMonths` the result has `months: null` and the figures at the
 * horizon. 04-20 passes horizonMonths = SIMULATION_MONTH_CAP. All arithmetic is bigint; no clock is read.
 */
function stepAmount(steps: readonly PaymentStep[], month: number): MinorUnits {
  const step = steps.find((s) => s.fromMonth <= month && month <= s.toMonth);
  return (step?.amount ?? 0) as MinorUnits;
}

export function paybackMonths(input: {
  readonly asOf: string;
  readonly plan: Plan;
  readonly runningNet: MinorUnits;
  readonly share: ResolvedShare;
  readonly change: PurchaseIncomeChange;
  readonly horizonMonths: number;
}): PaybackResult {
  const { asOf, plan, runningNet, share, change, horizonMonths } = input;
  if (!isValidLocalDate(asOf)) throw new RangeError(`${FN}: asOf "${asOf}" is not a valid local date`);
  if (!isValidLocalDate(change.startDate)) {
    throw new RangeError(`${FN}: startDate "${change.startDate}" is not a valid local date`);
  }
  if (!Number.isSafeInteger(change.monthlyAmount) || change.monthlyAmount <= 0) {
    throw new RangeError(`${FN}: monthlyAmount ${change.monthlyAmount} must be a positive integer`);
  }
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > SIMULATION_MONTH_CAP) {
    throw new RangeError(`${FN}: horizonMonths ${horizonMonths} must be an integer between 1 and ${SIMULATION_MONTH_CAP}`);
  }

  const start = monthOf(change.startDate);
  const monthlyRunning = BigInt(myPart(runningNet, share));
  let cost = BigInt(myPart(plan.dayOne, share));
  let income = 0n;
  for (let k = 1; k <= horizonMonths; k += 1) {
    cost += BigInt(myPart(stepAmount(monthlyStepsOf(plan), k), share)) + monthlyRunning;
    if (monthAfter(asOf, k) >= start) income += BigInt(change.monthlyAmount);
    if (income >= cost) {
      return {
        months: k,
        totalCost: minorFromBigInt(cost, FN),
        extraIncome: minorFromBigInt(income, FN),
        horizonMonths,
      };
    }
  }
  return { months: null, totalCost: minorFromBigInt(cost, FN), extraIncome: minorFromBigInt(income, FN), horizonMonths };
}
