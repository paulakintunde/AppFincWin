/**
 * Local-date and month maths (MON-14). A transaction happens on a calendar
 * day in the user's own time zone, not in UTC -- a late-evening entry must
 * stay on its own local day and in its own local month however UTC would
 * read it. Month boundaries and recurrence always derive from the stored
 * `local_date` string, never from a UTC timestamp such as `created_at`.
 *
 * This module never reads the device's own configured time zone -- the
 * engine has no I/O and no device state. The data layer (plan 01-10)
 * captures the zone via `expo-localization` and passes it in.
 */

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    // Called without `new` (both forms are spec-legal for Intl.DateTimeFormat);
    // this avoids constructing-and-discarding an instance purely for validation.
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalDate(s: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(s)) return false;
  const [yearStr, monthStr, dayStr] = s.split('-') as [string, string, string];
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  // Round-trip through Date.UTC and check the parts come back unchanged --
  // catches Feb 30, Apr 31, non-leap-year Feb 29, etc.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function localDateIn(instant: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`localDateIn: "${timeZone}" is not a valid IANA time zone`);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  // formatToParts always includes year/month/day when they are requested and the
  // instant/zone are both valid (already checked above) -- an invalid `instant`
  // (e.g. an Invalid Date) throws its own RangeError out of formatToParts itself,
  // so there is no reachable case where any of these three could be absent.
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;

  return `${year}-${month}-${day}`;
}

export function monthOf(localDate: string): string {
  if (!isValidLocalDate(localDate)) {
    throw new RangeError(`monthOf: "${localDate}" is not a valid local date`);
  }
  return localDate.slice(0, 7);
}

export function monthRange(month: string): { start: string; endExclusive: string } {
  if (!MONTH_PATTERN.test(month)) {
    throw new RangeError(`monthRange: "${month}" is not a valid 'YYYY-MM' month`);
  }
  const [yearStr, monthStr] = month.split('-') as [string, string];
  const year = Number(yearStr);
  const monthNum = Number(monthStr);

  const start = `${month}-01`;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const nextYear = monthNum === 12 ? year + 1 : year;
  const endExclusive = `${String(nextYear).padStart(4, '0')}-${String(nextMonthNum).padStart(2, '0')}-01`;

  return { start, endExclusive };
}
