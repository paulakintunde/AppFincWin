// 05-39 (D-34, D-37): a goal's saved-so-far is computed from its tagged lines, never stored, never guessed.
// PURE. Stored rates only; a line with no usable stored amount makes the figure null ('waiting for a rate').
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { FxLatestRow, TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';

export function savedSoFar(args: {
  goal: SavingsGoalRow;
  lines: readonly TransactionRow[];
  home: string;
  rates: readonly FxLatestRow[];
}): { saved: number | null; target: number | null } {
  const { goal, lines, home, rates } = args;
  let saved = goal.opening_saved;
  for (const line of lines) {
    if (line.goal_id !== goal.id || line.status !== 'paid' || line.deleted_at !== null) continue;
    // Only a goal in the home currency has a stored stamp to convert with; any other pairing waits.
    const amount = goal.currency === home ? homeAmountFor(line, home, rates) : null;
    if (amount === null) return { saved: null, target: goal.target };
    saved += Math.abs(amount);
  }
  return { saved, target: goal.target };
}
