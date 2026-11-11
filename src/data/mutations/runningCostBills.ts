// 06.1-13 (APP-29): after "I bought it", each running cost of the item can be added as an Activity bill, one at a time.
// Nothing is added without the user's tap (life changes are user-led): there is no batch API, one call makes one series with
// its own Undo. Lines the user switched off (on: false) are never offered.
import type { RunningCostLine } from '@/engine/decide/v3';
import type { RecurringFreq } from '@/engine/recurring/schedule';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import { useCreateSeries } from './recurringSeries';

export interface RunningCostBillContext {
  householdId: string;
  accountId: string;
  currency: string;
  timeZone: string;
  /** What the line is, in the user's words (for example "Insurance"). */
  label: string;
  /** Mints the series id. */
  mint: () => string;
}

const FREQ: Readonly<Record<RunningCostLine['everyMonths'], RecurringFreq>> = { 1: 'monthly', 3: 'quarterly', 12: 'yearly' };

/**
 * The recurring-series input for one running-cost line, or null when the line is switched off or has no amount.
 * Amount is the full line amount (an expense, so negative); the series starts on the line's own start date and ends on its end.
 */
export function runningCostBillOf(
  line: RunningCostLine,
  itemName: string,
  categoryId: string | null,
  ctx: RunningCostBillContext
): NewRecurringSeries | null {
  if (!line.on) return null;
  if (!Number.isSafeInteger(line.amount) || line.amount <= 0) return null;
  return {
    id: ctx.mint(),
    household_id: ctx.householdId,
    account_id: ctx.accountId,
    name: `${itemName.trim()} ${ctx.label.trim()}`.trim(),
    amount: -line.amount,
    currency: ctx.currency,
    category_id: categoryId,
    payment_type: null,
    freq: FREQ[line.everyMonths],
    anchor_date: line.start,
    time_zone: ctx.timeZone,
    end_date: line.end,
    occurrence_count: null,
  };
}

/** One running cost becomes one bill per call, with its own Undo. Returns the undo step id, or null when nothing was added. */
export function useAddRunningCostBill(): {
  add(args: {
    line: RunningCostLine;
    itemName: string;
    categoryId: string | null;
    ownerId: string;
    ctx: RunningCostBillContext;
  }): string | null;
} {
  const { create } = useCreateSeries();
  return {
    add({ line, itemName, categoryId, ownerId, ctx }) {
      const series = runningCostBillOf(line, itemName, categoryId, ctx);
      if (series === null) return null;
      return create({ series, ownerId });
    },
  };
}
