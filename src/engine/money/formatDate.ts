/**
 * Locale-aware local-date formatting (DSG-06, MON-14). A transaction's
 * `local_date` is a calendar day, not an instant -- rendering it must never
 * let the device's own time zone shift it to the day before or after, which
 * is why every format call below pins `timeZone: 'UTC'` and every date is
 * built from `Date.UTC`, never `new Date(string)`.
 */
export type LocalDateStyle = 'short' | 'medium' | 'long';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a stored `YYYY-MM-DD` local date string for display in the given
 * locale. Throws `RangeError` for a string that isn't shaped like a date, or
 * one that is shaped correctly but names no real calendar day (month 13,
 * February 30th) -- both are a caller bug (a corrupt or malformed stored
 * value), not a formatting decision.
 */
export function formatLocalDate(
  localDate: string,
  locale: string,
  style: LocalDateStyle = 'medium'
): string {
  const match = LOCAL_DATE_PATTERN.exec(localDate);
  if (!match) {
    throw new RangeError(`formatLocalDate: "${localDate}" is not a YYYY-MM-DD date string`);
  }

  // The pattern has exactly three capturing groups, all mandatory whenever
  // `exec` succeeds -- `noUncheckedIndexedAccess` cannot know that
  // statically, so these are documented non-null assertions, not unchecked
  // access.
  const year = Number(match[1]!);
  const month = Number(match[2]!);
  const day = Number(match[3]!);

  const utcMillis = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utcMillis);
  const isRealCalendarDate =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day;
  if (!isRealCalendarDate) {
    throw new RangeError(`formatLocalDate: "${localDate}" is not a real calendar date`);
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(utcMillis);
}
