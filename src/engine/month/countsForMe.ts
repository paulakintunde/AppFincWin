import { minorUnits, type MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import type { CountsLine } from './types';

/**
 * The one rule for what counts toward "me" (fix plan section 5 rule 5): the
 * database decides what each member can read; this one rule decides what counts.
 *
 * - A settlement never counts (D-06).
 * - The viewer's own line counts its amount.
 * - A shared line counts its amount: it is already the viewer's stored share.
 * - Another member's personal line counts only with that member's opt-in
 *   (`partnerOptIn === true`); absent means off.
 */
export function countsForMe(line: CountsLine): MinorUnits {
  if (line.isSettlement === true) return minorUnits(0);
  if (line.isMine) return line.amount;
  if (line.isShared) return line.amount;
  if (line.partnerOptIn === true) return line.amount;
  return minorUnits(0);
}

/** Exact BigInt sum of countsForMe over the lines; an empty list is 0. */
export function countsForMeTotal(lines: readonly CountsLine[]): MinorUnits {
  let sum = 0n;
  for (const l of lines) sum += BigInt(countsForMe(l));
  return minorFromBigInt(sum, 'month/countsForMe');
}
