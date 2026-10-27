/**
 * A seasonal earner's ready-by date (05.1-CONTEXT D-60). Pure.
 *
 * D-60: for a seasonal earner "how many typical months" is the wrong question, because a typical month hides the busy
 * and the lean ones. The date is found by walking month by month from last year's pattern: each month saves what was
 * left in the same calendar month last year (never below zero), until the gap is covered. A year that saves nothing gives
 * null, and so does a walk past the simulation horizon.
 */
import { SIMULATION_MONTH_CAP } from '../../../payoff/constants';
import { SEASON_CYCLE_MONTHS } from '../constants';
import { addYearMonths } from '../dates';
import type { IncomePicture } from '../types';
import { sameCalendarMonth } from './incomePattern';

/** What a month saves: last year's leftover of the same calendar month, never below zero. */
function savedIn(picture: Pick<IncomePicture, 'months'>, ym: string): bigint {
  const left = BigInt(sameCalendarMonth(picture.months, ym)?.left ?? 0);
  return left > 0n ? left : 0n;
}

/**
 * The first month after `fromYm` by which the savings reach `gap`, with how many months that is (at least 1).
 * null when a whole year saves nothing, or the walk passes the simulation horizon.
 */
export function seasonalReadyMonth(
  picture: Pick<IncomePicture, 'months'>,
  fromYm: string,
  gap: bigint
): { readonly months: number; readonly month: string } | null {
  let cycle = 0n;
  for (let i = 1; i <= SEASON_CYCLE_MONTHS; i++) cycle += savedIn(picture, addYearMonths(fromYm, i));
  if (cycle === 0n) return null;
  let total = 0n;
  for (let n = 1; n <= SIMULATION_MONTH_CAP; n++) {
    const ym = addYearMonths(fromYm, n);
    total += savedIn(picture, ym);
    if (total >= gap) return { months: n, month: ym };
  }
  return null;
}
