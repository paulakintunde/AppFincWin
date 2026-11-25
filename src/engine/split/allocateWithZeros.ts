// 10.1-04 (D-03): allocate() with zero weights allowed; mirrors SQL hh_allocate. allocate() itself stays strict.
import { minorUnits, type MinorUnits } from '../money/types';
import { allocate } from './allocate';

export function allocateWithZeros(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  if (weights.some((w) => w < 0)) {
    throw new RangeError('allocateWithZeros: weights must not be negative');
  }
  const positive = weights.filter((w) => w > 0);
  if (positive.length === 0) {
    throw new RangeError('allocateWithZeros: all weights are zero');
  }
  const shares = allocate(total, positive);
  let next = 0;
  return weights.map((w) => (w > 0 ? shares[next++]! : minorUnits(0)));
}
