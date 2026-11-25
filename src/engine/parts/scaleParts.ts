// 10.1-04 (D-03): convert a line's parts to another amount (home currency, household share) by largest remainder,
// so the converted parts add up exactly. Nothing is converted part by part.
import { minorUnits } from '../money/types';
import { allocateWithZeros } from '../split/allocateWithZeros';
import { expandParts } from './expandParts';
import type { CategoryAmount, LinePartsInput } from './types';

export function scaleParts(line: LinePartsInput, target: number): CategoryAmount[] {
  const rows = expandParts(line);
  if (rows.length === 1) return [{ ...rows[0]!, amount: target }];
  // An "over" gap (opposite sign to the line) has nothing to place: drop it.
  const kept = rows.filter((r) => !r.isGap || r.amount < 0 === line.amount < 0);
  const weights = kept.map((r) => Math.abs(r.amount));
  if (weights.every((w) => w === 0)) {
    return kept.map((r, i) => ({ ...r, amount: i === 0 ? target : 0 }));
  }
  const shares = allocateWithZeros(minorUnits(target), weights);
  return kept.map((r, i) => ({ ...r, amount: shares[i]! }));
}
