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
export const CARD_MIN_ESTIMATE_FLOOR = 2500; // minor units of a 2-decimal currency (25.00); use cardMinEstimateFloor for others

/** The floor is 25 whole units of the currency: 2500 for USD (2 decimals), 25 for JPY (0), 25000 for KWD (3). */
export function cardMinEstimateFloor(exponent = 2): MinorUnits {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) throw new RangeError(`${FN}: exponent ${exponent} must be 0..4`);
  return (25 * 10 ** exponent) as MinorUnits;
}

/** exponent: the currency's decimal places (currencyExponent); absent = 2, as before. */
export function estimatedCardMinimum(balance: MinorUnits, apr: Percent, exponent = 2): MinorUnits {
  if (balance < 0) throw new RangeError(`${FN}: balance must be >= 0`);
  const bal = BigInt(balance);
  const interest = divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
  const share = divideHalfUp(bal * BigInt(CARD_MIN_ESTIMATE_PERCENT), 100n);
  const base = interest + share;
  const floor = BigInt(cardMinEstimateFloor(exponent));
  const wanted = base > floor ? base : floor;
  const owed = bal + interest;
  return minorFromBigInt(wanted < owed ? wanted : owed, FN);
}
