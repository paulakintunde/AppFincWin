// Plan 05.2-22: pure helpers the income steps use to find the right account and the user's existing income series.
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import type { AccountRow, RecurringSeriesRow } from '@/db/rows';

/** Accounts that can receive pay: live, not archived, and not a card or loan. */
export function payableAccounts(accounts: readonly AccountRow[]): AccountRow[] {
  return accounts.filter((a) => a.deleted_at === null && a.archived_at === null && a.kind !== 'credit' && a.kind !== 'loan');
}

/** A live income series carrying this income kind (not ended, not paused). */
export function liveSeriesOfKind(series: readonly RecurringSeriesRow[], kind: string): RecurringSeriesRow[] {
  return seriesOfKind(series, kind).filter((s) => seriesStatusOf(s).kind === 'live');
}

/** 05.2 D-24: paused income series, built from the same filters as the live list. Listed read-only so Resume is reachable. */
export function pausedIncomeSeries(series: readonly RecurringSeriesRow[], kind?: string): RecurringSeriesRow[] {
  return series.filter((s) => s.deleted_at === null && s.income_kind != null && (kind === undefined || s.income_kind === kind) && s.amount > 0 && seriesStatusOf(s).kind === 'paused');
}

/** A live income series carrying this income kind. */
export function seriesOfKind(series: readonly RecurringSeriesRow[], kind: string): RecurringSeriesRow[] {
  return series.filter((s) => s.deleted_at === null && s.income_kind === kind && s.amount > 0);
}
