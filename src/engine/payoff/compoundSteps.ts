/**
 * GRW-11: month-by-month growth illustration (prototype `grow`). Each month
 * the interest on the balance is rounded half up, then the monthly add lands
 * (end of month). A year point is recorded every 12 months.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MONTHLY_RATE_DENOMINATOR, minorFromBigInt, type Percent } from './types';

const FN = 'compoundSteps';

export interface CompoundStepsResult {
  value: MinorUnits;
  putIn: MinorUnits;
  growth: MinorUnits;
  interest: MinorUnits;
  years: ReadonlyArray<{ value: MinorUnits; putIn: MinorUnits }>;
}

export function compoundSteps(
  start: MinorUnits,
  add: MinorUnits,
  apr: Percent,
  months: number
): CompoundStepsResult {
  if (start < 0 || add < 0) throw new RangeError(`${FN}: start and add must be >= 0`);
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`${FN}: months must be a whole number >= 0`);
  }
  const monthly = BigInt(add);
  let bal = BigInt(start);
  let put = bal;
  let interest = 0n;
  const years: Array<{ value: MinorUnits; putIn: MinorUnits }> = [];
  for (let k = 1; k <= months; k++) {
    const i = divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
    interest += i;
    bal += i + monthly;
    put += monthly;
    if (k % 12 === 0) {
      years.push({ value: minorFromBigInt(bal, FN), putIn: minorFromBigInt(put, FN) });
    }
  }
  return {
    value: minorFromBigInt(bal, FN),
    putIn: minorFromBigInt(put, FN),
    growth: minorFromBigInt(bal - put, FN),
    interest: minorFromBigInt(interest, FN),
    years,
  };
}
