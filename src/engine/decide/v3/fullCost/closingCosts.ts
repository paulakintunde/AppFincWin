/**
 * 05.4 BO-05 (05.4-26, Variant C): home closing costs as a % of the price, paid up front with it. Pure; bigint; half up.
 * RC-06: 2.5% of $40,000 is $1,000, so the up-front amount is $41,000. The % is of the price alone (before tax). No % (null) or 0%
 * adds nothing; a negative % is not a figure (RangeError, as sales tax).
 */
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt, ONE_HUNDRED_PERCENT, type Percent } from '../../../payoff/types';

export function closingCost(price: MinorUnits, percent: Percent | null): MinorUnits {
  if (percent === null) return minorFromBigInt(0n, 'closingCost');
  if (percent < 0n) throw new RangeError(`closingCost: closing percent ${percent} must be >= 0`);
  return minorFromBigInt(divideHalfUp(BigInt(price) * percent, ONE_HUNDRED_PERCENT), 'closingCost');
}
