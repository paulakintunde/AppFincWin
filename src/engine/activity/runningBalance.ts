/**
 * Running balance down the Activity list (UI-SPEC 1 "Running balance", D-25).
 * Only paid lines move the figure; pending and skipped lines are listed with
 * moves: false. The caller supplies opening = account.opening_balance and
 * paidBeforeMonth from account_paid_before (plan 11); for all accounts the
 * caller converts both to home currency and marks exact false when a rate is
 * missing. BigInt accumulation with an overflow flag, as in balance.ts.
 */
export interface RunningRow {
  id: string;
  local_date: string;
  created_at: string;
  status: 'paid' | 'pending' | 'skipped';
  /** Minor units, or null when it cannot be expressed (missing rate). */
  amount: number | null;
}

export interface RunningBalanceStep {
  id: string;
  moves: boolean;
  after: number | null;
}

function toSafeNumber(n: bigint): number | null {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(n);
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function runningBalance(input: {
  opening: number;
  paidBeforeMonth: string;
  rows: readonly RunningRow[];
}): {
  steps: RunningBalanceStep[];
  final: number | null;
  exact: boolean;
  overflow: boolean;
} {
  const ordered = [...input.rows].sort(
    (a, b) => cmp(a.local_date, b.local_date) || cmp(a.created_at, b.created_at) || cmp(a.id, b.id)
  );
  let acc: bigint | null = BigInt(input.opening) + BigInt(input.paidBeforeMonth);
  let exact = true;
  let overflow = false;
  const steps: RunningBalanceStep[] = [];
  for (const row of ordered) {
    const moves = row.status === 'paid';
    if (moves && acc !== null) {
      if (row.amount === null) {
        acc = null;
        exact = false;
      } else {
        acc += BigInt(row.amount);
        if (toSafeNumber(acc) === null) {
          acc = null;
          overflow = true;
        }
      }
    }
    steps.push({ id: row.id, moves, after: acc === null ? null : toSafeNumber(acc) });
  }
  const final = acc === null ? null : toSafeNumber(acc);
  return { steps, final, exact, overflow };
}
