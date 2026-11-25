// 10.1-09 (D-04, D-05): the one place a V3 line becomes category amounts. Every reader that groups by category goes through here,
// so a split line is counted once: the parts under their categories, the unplaced gap under Uncategorised (null).
import type { V3Line } from '../decide/v3/types';
import { minorUnits } from '../money/types';
import { expandParts } from './expandParts';
import { scaleParts } from './scaleParts';

type LineLike = Pick<V3Line, 'id' | 'amount' | 'categoryId' | 'parts'>;

function input(line: LineLike) {
  return { id: line.id, amount: line.amount, categoryId: line.categoryId, parts: line.parts ?? null };
}

export function linePartAmounts(line: LineLike): { categoryId: string | null; amount: number }[] {
  return expandParts(input(line)).map((r) => ({ categoryId: r.categoryId, amount: r.amount }));
}

/** The line's parts re-spread over a new amount (largest remainder); undefined when the line has no parts. */
export function scaleLineParts<L extends LineLike>(line: L, newAmount: number): L['parts'] {
  if (line.parts === undefined || line.parts.length < 2) return undefined;
  return scaleParts(input(line), newAmount)
    .filter((r) => !r.isGap)
    .map((r) => ({ categoryId: r.categoryId, amount: minorUnits(r.amount) }));
}
