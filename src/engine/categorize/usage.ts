// Category usage and cap maths. CONTEXT D-04/D-06; 2026-10-09 decision: paid and pending count.
// Pure: no I/O, no framework imports.

export interface UsageRow {
  amountHome: number | null;
  status: 'paid' | 'pending' | 'skipped';
  isTransfer: boolean;
  isRefund?: boolean;
}

export type CategoryUsageState = 'unused' | 'used' | 'capped' | 'over' | 'refundsExceed';

export interface CategoryUsageResult {
  count: number;
  spent: number;
  cap: number | null;
  over: number;
  state: CategoryUsageState;
  unconvertedCount: number;
}

export function categoryUsage(rows: readonly UsageRow[], cap: number | null): CategoryUsageResult {
  let count = 0;
  let sum = 0;
  let unconvertedCount = 0;
  for (const row of rows) {
    if (row.status === 'skipped' || row.isTransfer) continue;
    count += 1;
    if (row.amountHome === null) {
      unconvertedCount += 1;
    } else {
      sum += row.amountHome;
    }
  }
  // Expenses are negative, refunds positive: spent is the negated net. Never floored (D-06).
  const spent = 0 - sum;
  let state: CategoryUsageState;
  let over = 0;
  if (spent < 0) {
    state = 'refundsExceed';
  } else if (cap !== null && spent >= cap) {
    state = 'over';
    over = spent - cap;
  } else if (cap !== null) {
    state = 'capped';
  } else if (count > 0) {
    state = 'used';
  } else {
    state = 'unused';
  }
  return { count, spent, cap, over, state, unconvertedCount };
}

/** True only on the save that moves net spend from below the cap to at or above it. */
export function crossesCap(spentBefore: number, spentAfter: number, cap: number | null): boolean {
  if (cap === null) return false;
  return spentBefore < cap && spentAfter >= cap;
}
