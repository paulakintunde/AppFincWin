import type { MinorUnits } from '../money/types';
import { assessPlan } from './assess';
import { bisectLargest } from './bisectCore';
import { resolvePlanStrict, withPrice } from './plan';
import type { AffordablePrice, AssessContext, BuyCheck } from './types';

// bisectLargest moved to the leaf bisectCore.ts (05.1, D-16); re-exported so the decide barrel is unchanged.
export { bisectLargest } from './bisectCore';

/**
 * The largest price at which `check` still gets the verdict `fits` (the prototype's bisection over `ok`).
 * The predicate is assessPlan's state, so it includes every limit, the D-44 cash_dip and the D-48 highest
 * scheduled payment.
 *
 * D-41: pass the positioned context (Assessment.context from the combined verdict) to search against the
 * combined position; the predicate already includes cash_dip (D-44) and the highest scheduled payment (D-48).
 */
export function affordablePrice(context: AssessContext, check: BuyCheck): AffordablePrice {
  // resolvePlanStrict is safe: resolution depends on which terms are present, not on the price.
  const fits = (p: MinorUnits): boolean => {
    const c = withPrice(check, p);
    return assessPlan(context, c, resolvePlanStrict(c)).state === 'fits';
  };
  return bisectLargest(check.price, fits);
}
