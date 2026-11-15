import { allocate } from '../split/allocate';
import { minorUnits } from '../money/types';

export type RebalanceResult =
  | { readonly ok: true; readonly weights: readonly number[] }
  | { readonly ok: false; readonly reason: 'last_positive' };

/** Equal whole-percent weights totalling 100, extra points to the earliest members. */
export function evenWeights(n: number): readonly number[] {
  return allocate(minorUnits(100), Array<number>(n).fill(1));
}

/**
 * Sets one weight and rebalances the rest so the set totals 100 (D-30).
 * 0% is allowed; the last positive weight cannot go to 0.
 */
export function rebalanceWeights(
  current: readonly number[],
  index: number,
  next: number,
): RebalanceResult {
  if (!Number.isInteger(next) || next < 0 || next > 100) {
    throw new RangeError(`rebalanceWeights: next ${next} must be an integer 0..100`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= current.length) {
    throw new RangeError(`rebalanceWeights: index ${index} out of range`);
  }
  if (current.length < 2) {
    throw new RangeError('rebalanceWeights: needs at least two members');
  }
  const otherIdx = current.map((_, i) => i).filter((i) => i !== index);
  const othersPositive = otherIdx.filter((i) => current[i]! > 0);
  if (next === 0 && othersPositive.length === 0) return { ok: false, reason: 'last_positive' };

  const remainder = minorUnits(100 - next);
  const result = [...current];
  result[index] = next;
  if (othersPositive.length > 0) {
    const parts = allocate(
      remainder,
      othersPositive.map((i) => current[i]!),
    );
    otherIdx.forEach((i) => (result[i] = 0));
    othersPositive.forEach((i, k) => (result[i] = parts[k]!));
  } else {
    const parts = allocate(
      remainder,
      otherIdx.map(() => 1),
    );
    otherIdx.forEach((i, k) => (result[i] = parts[k]!));
  }
  return { ok: true, weights: result };
}
