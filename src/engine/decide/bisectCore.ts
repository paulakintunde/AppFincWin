// Leaf (05.1, D-16): v3 imports this file; it must never import the old engine.
import { minorUnits, type MinorUnits } from '../money/types';

/** Structurally identical to AffordablePrice in types.ts, so old callers keep compiling. */
export type BisectResult =
  | { readonly kind: 'full_price_fits'; readonly price: MinorUnits }
  | { readonly kind: 'nothing_affordable' }
  | { readonly kind: 'found'; readonly price: MinorUnits };

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
export function bisectLargest(upper: MinorUnits, fits: (price: MinorUnits) => boolean): BisectResult {
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
