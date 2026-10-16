import type { MinorUnits } from '../money/types';
import { EDGE_MARGIN_PERCENT } from './constants';
import type { LineMargin, MarginLine } from './types';

/**
 * The "on the edge" primitive (D-43). The verdict state is unchanged; the flag and the margin are reported beside it.
 *
 * A line is on the edge when it passed or failed by less than EDGE_MARGIN_PERCENT of its base: strict, so exactly 5% is
 * not on the edge. Compared as 100 x |margin| < 5 x base in bigint, with no division. A zero threshold (the month line,
 * or a typed 0) uses a month's costs as the base; a zero base never flags. Callers convert ratio lines to money first
 * (the dsr line as divideHalfUp(dsrLine x incomeBasis, ONE_HUNDRED_PERCENT), assembled in 04-20's lineMargins).
 * EDGE_MARGIN_PERCENT is a cited behaviour constant (D-58).
 */
export function isOnEdge(margin: MinorUnits, base: MinorUnits): boolean {
  if (!(base > 0)) return false;
  const bigMargin = BigInt(margin);
  const abs = bigMargin < 0n ? -bigMargin : bigMargin;
  return 100n * abs < BigInt(EDGE_MARGIN_PERCENT) * BigInt(base);
}

export function edgeMargin(
  line: MarginLine,
  margin: MinorUnits,
  threshold: MinorUnits,
  monthCosts: MinorUnits
): LineMargin {
  if (!Number.isSafeInteger(margin)) {
    throw new RangeError(`edgeMargin: margin ${margin} must be an integer`);
  }
  if (!Number.isSafeInteger(threshold) || threshold < 0) {
    throw new RangeError(`edgeMargin: threshold ${threshold} must be a non-negative integer`);
  }
  if (!Number.isSafeInteger(monthCosts) || monthCosts < 0) {
    throw new RangeError(`edgeMargin: monthCosts ${monthCosts} must be a non-negative integer`);
  }
  const base = threshold > 0 ? threshold : monthCosts;
  return { line, margin, threshold, base, flag: isOnEdge(margin, base) ? 'on_edge' : null };
}
