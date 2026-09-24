import { minorUnits, type MinorUnits } from '../money/types';

/**
 * Largest-remainder split (MON-03). Divides `total` across `weights` so the
 * shares always sum back to `total` exactly, using integer-only BigInt
 * maths throughout -- no float division and no flooring of a divided
 * value anywhere -- so the result can never drift or lose a cent.
 *
 * The tie-break is deterministic: when two or more shares have equal
 * fractional remainders, the leftover units go to the lowest weight index
 * first. `weights` is expected to be given in household-member join order,
 * so identical inputs always produce identical output -- this makes the
 * function safe to call repeatedly (e.g. to preview a split before saving)
 * and to reuse verbatim for Phase 8 household settlements.
 *
 * @param weights non-empty array of positive safe-integer weights (e.g.
 *   `household_members.weight`). Anything else throws `RangeError`.
 */
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  if (weights.length === 0) {
    throw new RangeError('allocate: weights must be a non-empty array');
  }
  for (const w of weights) {
    if (!Number.isInteger(w) || w <= 0) {
      throw new RangeError(`allocate: weight ${w} must be a positive integer`);
    }
  }

  const negative = total < 0;
  const absTotal = BigInt(Math.abs(total));
  const sumWeights = weights.reduce((s, w) => s + BigInt(w), 0n);

  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  for (const w of weights) {
    const p = absTotal * BigInt(w);
    floors.push(p / sumWeights);
    remainders.push(p % sumWeights);
  }

  const flooredSum = floors.reduce((s, f) => s + f, 0n);
  const leftover = absTotal - flooredSum;

  // Deterministic tie-break: remainder descending, then index ascending.
  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));

  const shares = [...floors];
  for (let k = 0n; k < leftover; k++) {
    const idx = order[Number(k)]!.i;
    shares[idx] = shares[idx]! + 1n;
  }

  return shares.map((s) => minorUnits(Number(negative ? -s : s)));
}
