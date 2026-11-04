/**
 * 05.4 BO-05 / D-42 (05.4-26): the day a purchase is to be bought. Pure; no clock (asOf is an input).
 *
 * - purchaseDateOf: check.purchaseDate when it is a real date after asOf, else asOf ("Bought today."). Every answer carries it
 *   (Result.purchaseDate, D-42), an ask included.
 * - dayOneDate: where the up-front money leaves the account on the 90-day cash path: the purchase date, held to the path's last day
 *   when it falls beyond it (the path still checks the money is there by then; never later, so never looser).
 * - monthsBetween / laterRoom: a purchase dated in a later month is judged on that date (RC-08). The usual months that end before
 *   its month (whole months strictly between this month and the purchase month) add their usual leftover to the money it can use;
 *   the purchase month's own money does not count ("$1,000 now plus December's $1,000 = $2,000 before January's pay"). A usual
 *   month at or below 0, or unknown, adds nothing.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { addDays, isValidLocalDate, parseDate } from '../dates';
import type { CheckV2, LocalDate } from '../types';

export function purchaseDateOf(check: Pick<CheckV2, 'purchaseDate'>, asOf: LocalDate): LocalDate {
  const d = check.purchaseDate;
  return d != null && isValidLocalDate(d) && d > asOf ? d : asOf;
}

export function dayOneDate(buyDate: LocalDate, asOf: LocalDate, days: number): LocalDate {
  const last = addDays(asOf, days - 1);
  return buyDate > last ? last : buyDate;
}

/** Whole months strictly between asOf's month and the purchase month (0 in this month or the next). */
export function monthsBetween(asOf: LocalDate, buyDate: LocalDate): number {
  const a = parseDate(asOf);
  const b = parseDate(buyDate);
  const n = b.y * 12 + b.m - (a.y * 12 + a.m) - 1;
  return n > 0 ? n : 0;
}

/** The usual leftover of the months that end before the purchase month: typicalLeft x monthsBetween, only when above 0. */
export function laterRoom(typicalLeft: MinorUnits | null, asOf: LocalDate, buyDate: LocalDate): MinorUnits {
  const per = typicalLeft !== null && typicalLeft > 0 ? BigInt(typicalLeft) : 0n;
  return minorFromBigInt(per * BigInt(monthsBetween(asOf, buyDate)), 'laterRoom');
}

/** The purchase falls in a later month than asOf's: this month's figure loses nothing to it. */
export function inLaterMonth(asOf: LocalDate, buyDate: LocalDate): boolean {
  return buyDate.slice(0, 7) > asOf.slice(0, 7);
}
