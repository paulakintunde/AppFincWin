// The one date calendar (05.5-10, ARC-06). Pure arithmetic on 'YYYY-MM-DD' local-date strings: no clock,
// no device time zone, no I/O. recurring/schedule.ts keeps its own copy because SQL mirrors it
// (check:recurring-mirror); calendarParity.property.test.ts proves the two agree.
import { isValidLocalDate } from './localDate';

const MS_PER_DAY = 86_400_000;

function assertDate(date: string, fn: string): void {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`${fn}: "${date}" is not a valid local date`);
  }
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days in a calendar month (month is 1..12). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  assertDate(s, 'parseDate');
  const [ys, ms, ds] = s.split('-') as [string, string, string];
  return { y: Number(ys), m: Number(ms), d: Number(ds) };
}

/** b minus a, in whole days. */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / MS_PER_DAY);
}

export function addDays(date: string, n: number): string {
  if (!Number.isInteger(n)) {
    throw new RangeError(`addDays: n must be an integer, got ${n}`);
  }
  const { y, m, d } = parseDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** The anchor moved by `months`, day clamped to the target month's length; computed from the anchor each time. */
export function addMonthsClamped(anchor: string, months: number): string {
  if (!Number.isInteger(months)) {
    throw new RangeError(`addMonthsClamped: months must be an integer, got ${months}`);
  }
  const { y, m, d } = parseDate(anchor);
  const total = m - 1 + months;
  const y2 = y + Math.floor(total / 12);
  const m2 = (((total % 12) + 12) % 12) + 1;
  return format(y2, m2, Math.min(d, daysInMonth(y2, m2)));
}
