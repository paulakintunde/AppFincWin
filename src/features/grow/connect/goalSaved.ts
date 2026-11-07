// 06-05 (BO-07 item 2): what a goal has saved. Opening amount plus its goal-tagged paid lines, each counted once. PURE.
import type { GoalLineSource, GoalSourceRow, ToHome } from './types';

/**
 * Saved so far in the home currency, or null when the opening amount or a line cannot convert (the caller leaves the goal out,
 * never guesses). A transfer leg counts signed (money in raises it, "Take some out" lowers it); any other tagged line counts its
 * absolute amount.
 */
export function goalSaved(row: GoalSourceRow, lines: readonly GoalLineSource[], toHome: ToHome): number | null {
  const opening = toHome(row.opening_saved, row.currency);
  if (opening === null) return null;
  let saved = opening;
  for (const line of lines) {
    if (line.goal_id !== row.id || line.status !== 'paid' || line.deleted_at !== null) continue;
    const amount = toHome(line.original_amount, line.original_currency);
    if (amount === null) return null;
    saved += line.transfer_id === null ? Math.abs(amount) : amount;
  }
  return saved;
}
