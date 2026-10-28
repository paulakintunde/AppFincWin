// 05.2 D-24: pure status reader and date rules for Stopped / Paused / Resume. No React, no db.
// end_reason is read only while end_date is set, so a leftover value on a live series, or a plain
// end (useEndSeries, the Decide go-ahead: end_reason null), can never read wrong.
import { addDays, addYearMonths, firstOfMonth, yearMonthOf } from '@/engine/decide/v3/dates';
import type { RecurringSeriesRow } from '@/db/rows';

type StatusRow = Pick<RecurringSeriesRow, 'end_date' | 'anchor_date'> & { end_reason?: RecurringSeriesRow['end_reason'] };

export type SeriesStatus = { kind: 'live' } | { kind: 'stopped'; from: string } | { kind: 'paused'; from: string };

export function seriesStatusOf(row: Pick<RecurringSeriesRow, 'end_date'> & { end_reason?: RecurringSeriesRow['end_reason'] }): SeriesStatus {
  if (row.end_date === null || row.end_date === undefined) return { kind: 'live' };
  const from = addDays(row.end_date, 1);
  return row.end_reason === 'paused' ? { kind: 'paused', from } : { kind: 'stopped', from };
}

/** The earliest date the server accepts: the start of the month 12 months before the current one. */
function oldestAllowed(today: string): string {
  return firstOfMonth(addYearMonths(yearMonthOf(today), -12));
}

export type StopDateProblem = 'tooEarly' | 'tooOld';

export function stopDateProblem(row: Pick<StatusRow, 'anchor_date'>, from: string, today: string): StopDateProblem | null {
  if (addDays(from, -1) < row.anchor_date) return 'tooEarly';
  if (from < oldestAllowed(today)) return 'tooOld';
  return null;
}

/** The end date a Stopped / Paused from `from` writes (the day before); null when the date is refused. */
export function endDateForStop(row: Pick<StatusRow, 'anchor_date'>, from: string, today: string): string | null {
  return stopDateProblem(row, from, today) === null ? addDays(from, -1) : null;
}

/** Resume is for a paused row only, strictly after its end date, and not more than 12 months back. */
export function resumeAllowed(row: StatusRow, on: string, today: string): boolean {
  const status = seriesStatusOf(row);
  if (status.kind !== 'paused') return false;
  if (row.end_date === null || on <= row.end_date) return false;
  return on >= oldestAllowed(today);
}
