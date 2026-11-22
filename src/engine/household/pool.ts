import { minorUnits } from '../money/types';
import type { MinorUnits } from '../money/types';
import { sharedMoneyFor } from './sharedMoney';
import type { SpendRule } from './spendRule';

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

/**
 * 08.1-22 (CMP-F19, owner 2026-11-20): what a Household check counts for me out of the PERSONAL pool under the group's spending rule.
 * `others` has one entry per member in member order: a partner's rounded figure when they count (both opt-ins, a figure, my currency),
 * null when they do not; the entry at `myIndex` is ignored. "What each person brings" (or a pool of one) is my own money. A set or
 * bill split counts my share of the pool of me and the members who count, re-scaled over those members; a pool whose shares are all
 * zero falls back to my own money. Slices of everyone in the pool add up to the pool.
 */
export function spendSlice(ownLeft: MinorUnits, others: readonly (MinorUnits | null)[], spend: SpendRule, myIndex: number): MinorUnits {
  if (spend.kind === 'bring') return ownLeft;
  const inPool = others.map((o, i) => i === myIndex || o !== null);
  const weights = spend.weights.filter((_, i) => inPool[i]);
  if (weights.every((w) => w <= 0) || inPool.filter(Boolean).length < 2) return ownLeft;
  const pool = minorUnits(others.reduce<number>((sum, o, i) => (i === myIndex || o === null ? sum : sum + o), ownLeft));
  return sharedMoneyFor(pool, weights, inPool.slice(0, myIndex).filter(Boolean).length);
}

/** What the household adds to my own personal money left under the spending rule: the slice less my own. */
export function spendDelta(ownLeft: MinorUnits, others: readonly (MinorUnits | null)[], spend: SpendRule, myIndex: number): MinorUnits {
  return minorUnits(spendSlice(ownLeft, others, spend, myIndex) - ownLeft);
}
