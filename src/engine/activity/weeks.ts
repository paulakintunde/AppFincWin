/**
 * Week buckets for the Activity Week view and Calendar (ACT-16).
 *
 * Prototype formula (FincWin United.dc.html ~5014):
 *   first0 = (dowOf1st - weekStart + 7) % 7
 *   week   = floor((day + first0 - 1) / 7) + 1
 *   range  = { from: max(1, (w-1)*7 - first0 + 1), to: min(dim, w*7 - first0) }
 * A month can span up to 6 weeks (RESEARCH Pitfall 5). Day-of-week comes from
 * Date.UTC so it never depends on the device time zone.
 */
import { daysInMonth } from '../recurring/schedule';

type WeekStart = 0 | 1;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonth(month: string): { year: number; mon: number } {
  const m = MONTH_RE.exec(month);
  if (m === null) throw new RangeError(`Invalid month: ${month}`);
  return { year: Number(m[1]), mon: Number(m[2]) };
}

/** Number of leading blank cells before the 1st, for the given week start. */
export function firstWeekdayOffset(month: string, weekStart: WeekStart): number {
  const { year, mon } = parseMonth(month);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  return (d.getUTCDay() - weekStart + 7) % 7;
}

/** 1-based week of the month a day falls in. */
export function weekOfMonth(month: string, day: number, weekStart: WeekStart): number {
  const { year, mon } = parseMonth(month);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, mon)) {
    throw new RangeError(`Invalid day ${day} for ${month}`);
  }
  return Math.floor((day + firstWeekdayOffset(month, weekStart) - 1) / 7) + 1;
}

/** Number of weeks (4 to 6) the month spans. */
export function weeksInMonth(month: string, weekStart: WeekStart): number {
  const { year, mon } = parseMonth(month);
  return weekOfMonth(month, daysInMonth(year, mon), weekStart);
}

/** Inclusive day range of a 1-based week. */
export function weekRange(
  month: string,
  week: number,
  weekStart: WeekStart
): { from: number; to: number } {
  const { year, mon } = parseMonth(month);
  if (!Number.isInteger(week) || week < 1 || week > weeksInMonth(month, weekStart)) {
    throw new RangeError(`Invalid week ${week} for ${month}`);
  }
  const first0 = firstWeekdayOffset(month, weekStart);
  return {
    from: Math.max(1, (week - 1) * 7 - first0 + 1),
    to: Math.min(daysInMonth(year, mon), week * 7 - first0),
  };
}
