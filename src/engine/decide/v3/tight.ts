/**
 * The tight caution (05.4 FIN-07, UX-03; D-40). Pure; integer minor units; bigint for the share test.
 *
 * Owner's tight rule (05.4-CONTEXT, 2026-11-01): "'Tight' applies when the payment takes more than 80% of the usual monthly room,
 * OR the money left each month falls below a floor: a line the user set, or less than a tenth of a month's spending."
 * D-40 (owner round 1): "'tight' also applies to one-off purchases: money left after the purchase under a tenth of a usual month's
 * bills plus everyday spending." One-offs read the floor only, never the 80% share.
 *
 * - The month's spending is the usual month's bills plus its everyday spending (MonthModel recurringBills + e). On quick estimates
 *   these are the estimates' bills and everyday part (QE-01: £1,000 + £300, floor £130). Card and loan minimums and regular saving
 *   are set-asides, not spending (DB-02: $1,200 + $800, floor $200, with a $300 card minimum beside it).
 * - The floor is the user's line when one is set, else a tenth of that spending, rounded up to the minor unit.
 * - Plans: tight when payment x 10,000 > room x 8,000, or room - payment < floor. One-offs: tight when left < floor.
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { ceilDivide } from '../../payoff/types';
import { TIGHT_FLOOR_DIVISOR, TIGHT_SHARE_BP } from './constants';
import type { Fact, MonthModel } from './types';

const BP = 10000n;

export type TightBasis = 'user_line' | 'tenth';

export interface TightFloor {
  readonly floor: MinorUnits;
  readonly basis: TightBasis;
}

/** A usual month's bills plus everyday spending; an unknown everyday figure counts as 0. Never below 0. */
export function monthlySpendingOf(month: Pick<MonthModel, 'recurringBills' | 'e'>): MinorUnits {
  const total = month.recurringBills + (month.e ?? 0);
  return minorUnits(total > 0 ? total : 0);
}

/** The user's line when set (never below 0), else a tenth of the month's spending, rounded up. */
export function tightFloor(monthlySpending: MinorUnits, userLine: MinorUnits | null | undefined): TightFloor {
  if (userLine !== null && userLine !== undefined) return { floor: minorUnits(userLine > 0 ? userLine : 0), basis: 'user_line' };
  const spend = monthlySpending > 0 ? BigInt(monthlySpending) : 0n;
  return { floor: minorUnits(Number(ceilDivide(spend, BigInt(TIGHT_FLOOR_DIVISOR)))), basis: 'tenth' };
}

/** Plans (FIN-07): the payment takes more than 80% of the usual room, or the room left after it is under the floor. */
export function isTight(room: MinorUnits, payment: MinorUnits, monthlySpending: MinorUnits, userLine: MinorUnits | null | undefined): boolean {
  if (BigInt(payment) * BP > BigInt(room) * BigInt(TIGHT_SHARE_BP)) return true;
  return room - payment < tightFloor(monthlySpending, userLine).floor;
}

/** One-offs (D-40): the money left after the purchase is under the floor. The 80% share does not apply. */
export function isTightOneOff(left: MinorUnits, monthlySpending: MinorUnits, userLine: MinorUnits | null | undefined): boolean {
  return left < tightFloor(monthlySpending, userLine).floor;
}

/** The fact a tight answer carries: "That is under $X, a tenth of what you usually spend in a month." or the user's line. */
export function tightFact(t: TightFloor): Fact {
  return { code: 'tight_floor', values: { floor: t.floor, basis: t.basis } };
}
