import { minorUnits, type MinorUnits } from '../money/types';
import { assessPlan } from './assess';
import { resolvePlanStrict, withPrice } from './plan';
import type { AffordablePrice, AssessContext, BuyCheck } from './types';

/**
 * Exact largest-price search over integer minor units (DEC-09, D-20).
 *
 * The prototype ran 22 float halvings and then rounded down to the hundred; this runs on integers until the
 * bracket is one minor unit wide, so the answer is exact. No money value is ever floated: `hi - lo` is a
 * difference of safe integers, and Math.floor of half of it is exact.
 *
 * Invariant: fits(lo) && !fits(hi). Termination: hi - lo shrinks by at least half each step, so the predicate is
 * called O(log2 upper) times (at most ceil(log2 upper) + 2).
 *
 * Guarantee: a `found` price p satisfies fits(p) && !fits(p + 1). That holds even where fits is not globally
 * monotone. It is monotone in price for personal and 2-member-even scopes (including across a vehicle dealer
 * cap), but largest-remainder splits (allocate) can lower one member's part by one minor unit as the total
 * rises when 3+ weights are unequal (Alabama paradox, noted in share.ts). In that case the returned price never
 * overstates (p always fits) and, against the true largest affordable price, understates by at most
 * ceil(W / w_me) minor units (W = sum of weights, w_me = my weight) and the member's own share by at most
 * 1 minor unit. The bounded-error property test in bisect.test.ts is the evidence.
 */
export function bisectLargest(upper: MinorUnits, fits: (price: MinorUnits) => boolean): AffordablePrice {
  if (!Number.isSafeInteger(upper) || upper < 0) {
    throw new RangeError(`bisectLargest: upper ${upper} must be a non-negative safe integer`);
  }
  if (!fits(minorUnits(0))) {
    return { kind: 'nothing_affordable' };
  }
  if (fits(upper)) {
    return { kind: 'full_price_fits', price: upper };
  }
  let lo = 0;
  let hi: number = upper;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (fits(minorUnits(mid))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { kind: 'found', price: minorUnits(lo) };
}

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
