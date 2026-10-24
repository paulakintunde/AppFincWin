import { minorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from '../payoff/constants';
import { minorOrNull } from '../payoff/types';
import { DEFAULT_PROJECTION_HORIZON_MONTHS } from './constants';
import { myPart } from './share';
import type { PurchaseCheck, TotalCost, TotalCostInput, Verdict } from './types';

const FN = 'totalCost';

/**
 * D-102: the total cost of ownership over the check's horizon, from figures the check already holds (no new input):
 *
 *   total = myPart(plan.total) + max(0, mineRunning) x H - resale
 *   resale = 0 with no loss of value, else myPart(advertised) - min(myPart(advertised), myPart(lossMonthly) x H)
 *
 * H is the investing views' horizon (chosen, else the plan term, else 60) and never less than the plan's months. Each
 * component passes through myPart once (half-up, D-20); the rest is exact bigint. Null (the row is hidden, never
 * thrown) for an investment check, a missing verdict, a plan with no total (HI-02), or a figure past the safe range.
 */
export function totalCost(check: PurchaseCheck, verdict: Verdict, input: TotalCostInput): TotalCost | null {
  if (check.kind === 'invest' || verdict.state === 'missing') return null;
  const { plan } = verdict;
  const planTotal = plan.total;
  if (planTotal === null) return null;
  const chosen = input.horizonMonths;
  if (chosen !== null && (!Number.isInteger(chosen) || chosen < 1 || chosen > MAX_TERM_MONTHS)) {
    throw new RangeError(`${FN}: horizonMonths ${chosen} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }
  const horizon = Math.max(chosen ?? (plan.months > 0 ? plan.months : DEFAULT_PROJECTION_HORIZON_MONTHS), plan.months);

  const share = verdict.context.purchaseShare;
  const mineTotal = BigInt(myPart(planTotal, share));
  const price = BigInt(myPart(plan.price, share));
  const running = BigInt(Math.max(0, verdict.mineRunning)) * BigInt(horizon);
  let resale = 0n;
  if (input.lossMonthly > 0) {
    const advertised = BigInt(myPart(input.advertised, share));
    const lost = BigInt(myPart(input.lossMonthly, share)) * BigInt(horizon);
    resale = advertised - (lost < advertised ? lost : advertised);
  }
  const total = mineTotal + running - resale;

  const interest = mineTotal - price;
  if ([total, interest, running, resale].some((v) => minorOrNull(v) === null)) return null;
  return {
    horizonMonths: horizon,
    total: minorUnits(Number(total)),
    interestAndFees: minorUnits(Number(interest)),
    running: minorUnits(Number(running)),
    resale: minorUnits(Number(resale)),
    trivial: total === price,
  };
}
