import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { HALF_MONTHS_PER_MONTH, RESERVE_HALF_MONTHS } from './constants';
import type { Steadiness } from './types';

/**
 * The default cushion (DEC-06, D-01, D-42 as amended 2026-10-15): a month's costs times the half-months for the
 * income's steadiness, over two. 3 months Steady, 4.5 Variable, 6 Volatile; under 3 full months it is 3 months, because
 * the worst-income / highest-spending basis and the `rough` confidence already carry the caution.
 *
 * Half-months keep 4.5 exact in integers, so an odd figure is rounded once, half-up (never a 4.5 or Percent multiply).
 * The cited sources for the mapping live in constants.ts (D-58). A reserve the user typed always wins and never reaches
 * this function (04-07).
 */
export function reserveHalfMonthsFor(steadiness: Steadiness): number {
  return RESERVE_HALF_MONTHS[steadiness];
}

export function defaultReserve(monthCosts: MinorUnits, steadiness: Steadiness): MinorUnits {
  if (!Number.isSafeInteger(monthCosts) || monthCosts < 0) {
    throw new RangeError(`defaultReserve: monthCosts ${monthCosts} must be a non-negative integer`);
  }
  const halves = BigInt(reserveHalfMonthsFor(steadiness));
  return minorFromBigInt(
    divideHalfUp(BigInt(monthCosts) * halves, BigInt(HALF_MONTHS_PER_MONTH)),
    'defaultReserve'
  );
}
