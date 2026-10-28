// Plan 05.2-22: pure helpers the income steps use to find the right account and the user's existing income series.
import type { AccountRow, RecurringSeriesRow } from '@/db/rows';

/** Accounts that can receive pay: live, not archived, and not a card or loan. */
export function payableAccounts(accounts: readonly AccountRow[]): AccountRow[] {
  return accounts.filter((a) => a.deleted_at === null && a.archived_at === null && a.kind !== 'credit' && a.kind !== 'loan');
}

/** A live income series carrying this income kind. */
export function seriesOfKind(series: readonly RecurringSeriesRow[], kind: string): RecurringSeriesRow[] {
  return series.filter((s) => s.deleted_at === null && s.income_kind === kind && s.amount > 0);
}
