// 06.1-27 (UX-20): the look-back compares what Decide counted with what the user's records show. It is a comparison, never a score.
// Pure: integer minor units in, a plain figure out. A decision with no linked running cost, or one that cannot be converted, has none.
import type { RowDelta } from './data/usePastDecisions';

/** The look-back needs this many compared decisions before the "how close" line is shown. */
export const HOW_CLOSE_AFTER = 3;

export interface LookBack {
  expected: number;
  actual: number;
  diff: number;
}

/** The monthly comparison of one decision, or null when it has none (a plan's schedule match is not a look-back). */
export function lookBackOf(delta: RowDelta | null): LookBack | null {
  if (delta === null || delta.kind !== 'monthly') return null;
  return { expected: delta.estimate, actual: delta.actual, diff: delta.diff };
}

/**
 * How close the estimates were on average, as a whole percent of each estimate, or null before HOW_CLOSE_AFTER look-backs.
 * A look-back whose estimate was zero has no percent and is left out of the average (it still counts towards the three).
 */
export function howClosePercent(lookBacks: readonly LookBack[]): { count: number; percent: number } | null {
  if (lookBacks.length < HOW_CLOSE_AFTER) return null;
  const usable = lookBacks.filter((l) => l.expected > 0);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, l) => sum + Math.abs(l.diff) / l.expected, 0);
  return { count: lookBacks.length, percent: Math.round((total / usable.length) * 100) };
}
