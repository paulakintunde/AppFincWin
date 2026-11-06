/**
 * D-28: when a card has no typed minimum, Grow estimates one from a fixed rule
 * the screen labels as an estimate: this month's interest plus 1% of the
 * balance (half up), never less than the floor, never more than is owed.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MONTHLY_RATE_DENOMINATOR, minorFromBigInt, type Percent } from './types';

const FN = 'estimatedCardMinimum';

export const CARD_MIN_ESTIMATE_PERCENT = 1; // percent of balance
export const CARD_MIN_ESTIMATE_FLOOR = 2500; // minor units

export function estimatedCardMinimum(balance: MinorUnits, apr: Percent): MinorUnits {
  if (balance < 0) throw new RangeError(`${FN}: balance must be >= 0`);
  const bal = BigInt(balance);
  const interest = divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
  const share = divideHalfUp(bal * BigInt(CARD_MIN_ESTIMATE_PERCENT), 100n);
  const base = interest + share;
  const floor = BigInt(CARD_MIN_ESTIMATE_FLOOR);
  const wanted = base > floor ? base : floor;
  const owed = bal + interest;
  return minorFromBigInt(wanted < owed ? wanted : owed, FN);
}
