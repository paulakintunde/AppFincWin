import { minorUnits } from '../money/types';
import type { MinorUnits } from '../money/types';
import { sharedMoneyFor } from './sharedMoney';

/**
 * 08.1-08 (CMP-F19, D-03, owner 2026-11-20): the money a Household check counts for me. The pool is my own money left this month
 * plus the rounded figure of each partner who has opted in (both sides on); I count only my agreed share of it, by the same
 * largest-remainder split as every other split (sharedMoneyFor). The slices of everyone in the pool add up to the pool, so two
 * "Fits" answers can never spend the same money twice. This refines D-03's literal "own + partner figure" on the owner's choice.
 *
 * `weights` are the household weights of the members IN the pool (me and each sharing partner), in the same order as
 * `myIndex`. With no partner figure there is no pool: the answer is my own money, unchanged.
 */
export function householdLeft(
  ownLeft: MinorUnits,
  partnerLefts: readonly MinorUnits[],
  weights: readonly number[],
  myIndex: number,
): MinorUnits {
  if (partnerLefts.length === 0) return ownLeft;
  const pool = minorUnits(partnerLefts.reduce<number>((sum, p) => sum + p, ownLeft));
  return sharedMoneyFor(pool, weights, myIndex);
}

/** What the household adds to my own money left: the slice less my own. Zero with no pool. */
export function householdDelta(
  ownLeft: MinorUnits,
  partnerLefts: readonly MinorUnits[],
  weights: readonly number[],
  myIndex: number,
): MinorUnits {
  return minorUnits(householdLeft(ownLeft, partnerLefts, weights, myIndex) - ownLeft);
}
