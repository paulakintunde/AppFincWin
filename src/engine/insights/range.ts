/**
 * 07-02 (INS-02, D-12, D-21, D-26a): the range control for Insights bars. Pure, integer minor units.
 * D-26a: every range is N full months plus this month so far ("6m" = 6 full months + the current one). The bars given end with the
 * current month (monthBars with throughCurrent), and stop at Decide's window (12 past months + this one), so "all" is never longer.
 */
import type { MinorUnits } from '../money/types';
import type { MonthBar } from '../month/types';
import { minorFromBigInt } from '../payoff/types';

const FN = 'insights/range';

export type InsightsRange = '6m' | '1y' | 'all';

/** Full months before this one for each range; null = every month given. This month so far is added on top (D-26a). */
export const RANGE_MONTHS: Readonly<Record<InsightsRange, number | null>> = { '6m': 6, '1y': 12, all: null };

/** D-21: leading empty months are trimmed, then the last N full months plus this month are kept. */
export function barsInRange(bars: readonly MonthBar[], range: InsightsRange): readonly MonthBar[] {
  const first = bars.findIndex((b) => b.comesIn !== 0 || b.goesOut !== 0);
  const live = first === -1 ? [] : bars.slice(first);
  const n = RANGE_MONTHS[range];
  return n === null ? live : live.slice(-(n + 1));
}

export function monthsInRange(bars: readonly MonthBar[], range: InsightsRange): readonly string[] {
  return barsInRange(bars, range).map((b) => b.month);
}

/** The In / Out / Left strip for a range: BigInt sums, minorFromBigInt out (no money is summed in the UI). */
export function barTotals(bars: readonly MonthBar[]): { readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } {
  let comesIn = 0n;
  let goesOut = 0n;
  for (const b of bars) {
    comesIn += BigInt(b.comesIn);
    goesOut += BigInt(b.goesOut);
  }
  return { comesIn: minorFromBigInt(comesIn, FN), goesOut: minorFromBigInt(goesOut, FN), left: minorFromBigInt(comesIn - goesOut, FN) };
}
