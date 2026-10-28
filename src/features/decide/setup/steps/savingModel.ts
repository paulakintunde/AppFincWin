/**
 * Plan 05.2-24: the pure model behind the Regular saving step. No React, no I/O; integer minor units throughout.
 *
 * `bucketTotalLine` picks the state of the total line under the bucket cards (UI-SPEC "Total line", D-22). The
 * 'more' state carries what the tile needs: the overshoot, the amount a Raise would set, and whether Raise is
 * offered (only when exactly one saving series exists, so it is clear which one is edited).
 */

export type BucketTotal =
  | { kind: 'empty' }
  | { kind: 'equal'; total: number; regular: number }
  | { kind: 'less'; total: number; regular: number; general: number }
  | { kind: 'more'; total: number; regular: number; over: number; raiseTo: number; canRaise: boolean };

export function bucketTotalLine(
  bucketMonthlies: readonly number[],
  regularSavingMonthly: number,
  savingSeriesCount: number
): BucketTotal {
  let total = 0;
  for (const m of bucketMonthlies) total += Math.max(0, m);
  if (total === 0) return { kind: 'empty' };
  if (total === regularSavingMonthly) return { kind: 'equal', total, regular: regularSavingMonthly };
  if (total < regularSavingMonthly) {
    return { kind: 'less', total, regular: regularSavingMonthly, general: regularSavingMonthly - total };
  }
  return {
    kind: 'more',
    total,
    regular: regularSavingMonthly,
    over: total - regularSavingMonthly,
    raiseTo: total,
    canRaise: savingSeriesCount === 1,
  };
}

export type BucketReadiness =
  | { kind: 'eta'; months: number; monthly: number; target: number }
  | { kind: 'addGoal' }
  | { kind: 'addMonthly' };

/** Whole months to reach `target` from `saved` at `monthly` a month (rounded up). */
export function bucketReadiness(saved: number, monthly: number, target: number | null): BucketReadiness {
  if (monthly <= 0) return { kind: 'addMonthly' };
  if (target === null || target <= 0) return { kind: 'addGoal' };
  const remaining = target - saved;
  const months = remaining <= 0 ? 0 : Math.ceil(remaining / monthly);
  return { kind: 'eta', months, monthly, target };
}

/** Splits whole months into years and months for the readiness wording ("12 years 6 months"). */
export function splitMonths(months: number): { years: number; months: number } {
  return { years: Math.floor(months / 12), months: months % 12 };
}
