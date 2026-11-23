/**
 * Archive view rules (DAT-01, D-13).
 *
 * Archiving only tidies the list of months a person browses and their search
 * results. It never changes a money answer, so there is no money maths here and
 * no Decide, balance, goals or Insights module may import this one.
 */
import { monthOf } from '../time/localDate';

/** 'YYYY-MM'. Lexicographic order equals date order. */
export type MonthKey = string;

export function monthKeyOf(localDate: string): MonthKey {
  return monthOf(localDate);
}

export function isArchivedMonth(month: MonthKey, archived: ReadonlySet<MonthKey>): boolean {
  return archived.has(month);
}

export function visibleMonths(
  months: readonly MonthKey[],
  archived: ReadonlySet<MonthKey>,
): MonthKey[] {
  return months.filter((m) => !archived.has(m));
}

/** Only past months can be archived; the current and future months never can. */
export function canArchiveMonth(month: MonthKey, today: string): boolean {
  return month < monthKeyOf(today);
}

export function withoutArchivedRows<R extends { local_date: string }>(
  rows: readonly R[],
  archived: ReadonlySet<MonthKey>,
): R[] {
  return rows.filter((r) => !archived.has(monthKeyOf(r.local_date)));
}

export function archivedCount(archived: ReadonlySet<MonthKey>): number {
  return archived.size;
}
