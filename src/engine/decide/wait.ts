import { minorUnits, type MinorUnits } from '../money/types';
import { ceilDivide } from '../payoff/types';
import { occurrenceDate } from '../recurring/schedule';
import { spareCashOf } from './alternatives';
import { SIMULATION_MONTH_CAP } from './constants';
import { myPart } from './share';
import type { AssessContext, PurchaseCheck, WaitPlan } from './types';

/**
 * The wait-and-save panel (D-40): how long until the purchase can be bought outright from saving.
 *
 * Waiting buys outright, so the target is what spare cash does not cover: my part of the price (D-34, through the
 * purchase share) less the cash above the cushion. That cash is context.cashAfterBills, always after the bills due
 * within 90 days (D-24), with or without a confirmed pay series; the figure is the same one the alternatives table uses
 * (spareCashOf). An invest check targets its amount. The default monthly amount is the monthly surplus before the
 * purchase.
 *
 * The prototype's 25.00 minimum amount and its display rounding are UI concerns, not engine behaviour (D-05). 05 D-10:
 * the decision record stores the amount and the ready-by date.
 */
export function buildWaitPlan(
  context: AssessContext,
  check: PurchaseCheck,
  monthlyAmount: MinorUnits | null
): WaitPlan {
  if (monthlyAmount !== null && (!Number.isSafeInteger(monthlyAmount) || monthlyAmount < 0)) {
    throw new RangeError(`buildWaitPlan: amount ${monthlyAmount} must be a whole number >= 0`);
  }
  const spareCash = spareCashOf(context);
  const spareMonthly = minorUnits(Math.max(0, context.leftBefore));
  const target =
    check.kind === 'invest'
      ? check.amount
      : minorUnits(Math.max(0, myPart(check.price, context.purchaseShare) - spareCash));
  const amount = monthlyAmount ?? spareMonthly;
  const months = amount > 0 ? Math.max(1, Number(ceilDivide(BigInt(target), BigInt(amount)))) : null;
  const readyBy =
    months === null || months > SIMULATION_MONTH_CAP
      ? null
      : occurrenceDate(context.snapshot.asOf, 'monthly', months);
  return {
    target,
    monthlyAmount: amount,
    spareMonthly,
    withinSpare: amount <= spareMonthly,
    months,
    readyBy,
  };
}
