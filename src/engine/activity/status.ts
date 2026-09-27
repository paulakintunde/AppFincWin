/**
 * Planned-vs-paid status rules and the month switcher (D-05, D-06, ACT-02).
 * Pure calendar/status maths on `local_date`/`'YYYY-MM'` strings -- no
 * `Date.now()`, no device time zone lookup (mirrors src/engine/time/localDate.ts).
 */
import { isValidLocalDate, monthOf } from '../time/localDate';

export type TxStatus = 'pending' | 'paid' | 'skipped';

function assertLocalDate(s: string, label: string): void {
  if (!isValidLocalDate(s)) {
    throw new RangeError(`${label}: "${s}" is not a valid local date`);
  }
}

export function directionOf(originalAmount: number): 'in' | 'out' {
  return originalAmount < 0 ? 'out' : 'in';
}

/**
 * D-05: an overdue pending occurrence stays pending -- this only flags it as
 * overdue for the bills-due alert to read. Nothing here marks anything paid.
 */
export function isOverdue(row: { status: TxStatus; local_date: string }, today: string): boolean {
  assertLocalDate(row.local_date, 'isOverdue');
  assertLocalDate(today, 'isOverdue');
  return row.status === 'pending' && row.local_date < today;
}

/**
 * D-06: marking paid dates the row today, or its due date if that is earlier.
 * 'YYYY-MM-DD' strings compare chronologically as plain strings.
 */
export function markPaidDate(today: string, dueDate: string): string {
  assertLocalDate(today, 'markPaidDate');
  assertLocalDate(dueDate, 'markPaidDate');
  return dueDate < today ? dueDate : today;
}

/**
 * A hand-entered row dated after today defaults to pending, otherwise paid
 * (Claude's discretion, recorded in 02-CONTEXT.md).
 */
export function defaultStatusFor(localDate: string, today: string): 'pending' | 'paid' {
  assertLocalDate(localDate, 'defaultStatusFor');
  assertLocalDate(today, 'defaultStatusFor');
  return localDate > today ? 'pending' : 'paid';
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function nextMonth(month: string): string {
  if (!MONTH_PATTERN.test(month)) {
    throw new RangeError(`nextMonth: "${month}" is not a valid 'YYYY-MM' month`);
  }
  const [yearStr, monthStr] = month.split('-') as [string, string];
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const nextYear = monthNum === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonthNum).padStart(2, '0')}`;
}

/**
 * ACT-02: every month that has data, plus the current and next month, newest
 * first. Deduplicated. Stays compatible with a later `archive_months` concept
 * because it only ever needs the caller's own list of months with data.
 */
export function monthsForSwitcher(dataMonths: readonly string[], today: string): string[] {
  const current = monthOf(today);
  const next = nextMonth(current);
  // A Set already guarantees every entry is distinct, so a two-way comparator
  // (never an a === b tie) is sufficient here.
  const months = new Set<string>([...dataMonths, current, next]);
  return [...months].sort((a, b) => (a < b ? 1 : -1));
}
