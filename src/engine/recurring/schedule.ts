/**
 * Recurring schedule maths (D-03, D-04). Pure calendar arithmetic on
 * 'YYYY-MM-DD' local-date strings -- no clock, no device time zone, no I/O.
 * Occurrence n is always computed directly from the anchor date (never by
 * stepping from the previous clamped date), so month-end clamping never
 * drifts: the 31st becomes 30 Apr, 28/29 Feb, and returns to the 31st in May.
 *
 * Mirrored in SQL by `public.recurring_occurrence_date()` (plan 02-08) and
 * proven to agree via the shared fixture
 * `supabase/tests/fixtures/recurring-schedule-cases.json`.
 */

import { isValidLocalDate, monthRange } from '../time/localDate';

export const RECURRING_FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringFreq = (typeof RECURRING_FREQS)[number];

export interface RecurringSchedule {
  anchorDate: string; // first occurrence, 'YYYY-MM-DD'
  freq: RecurringFreq;
  endDate: string | null; // inclusive
  occurrenceCount: number | null; // occurrences n = 0 .. count-1
}

export const MAX_OCCURRENCES_PER_CALL = 1000;

const STEP_DAYS: Record<'weekly' | 'fortnightly', number> = {
  weekly: 7,
  fortnightly: 14,
};

const MONTHS_PER_OCCURRENCE: Record<'monthly' | 'quarterly' | 'yearly', number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export function isRecurringFreq(s: string): s is RecurringFreq {
  return (RECURRING_FREQS as readonly string[]).includes(s);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseLocalDate(s: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = s.split('-') as [string, string, string];
  return { year: Number(yearStr), month: Number(monthStr), day: Number(dayStr) };
}

function formatLocalDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isDayBasedFreq(freq: RecurringFreq): freq is 'weekly' | 'fortnightly' {
  return freq === 'weekly' || freq === 'fortnightly';
}

function occurrenceDateDayBased(anchorDate: string, freq: 'weekly' | 'fortnightly', n: number): string {
  const { year, month, day } = parseLocalDate(anchorDate);
  const stepDays = STEP_DAYS[freq];
  const dt = new Date(Date.UTC(year, month - 1, day + stepDays * n));
  return formatLocalDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function occurrenceDateMonthBased(
  anchorDate: string,
  freq: 'monthly' | 'quarterly' | 'yearly',
  n: number
): string {
  const { year, month, day } = parseLocalDate(anchorDate);
  const months = MONTHS_PER_OCCURRENCE[freq] * n;
  const total = month - 1 + months;
  const y2 = year + Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  const d2 = Math.min(day, daysInMonth(y2, m2));
  return formatLocalDate(y2, m2, d2);
}

/**
 * The exact local date of the nth occurrence (n = 0 is the anchor itself),
 * computed directly from the anchor -- never by stepping from the previous
 * occurrence, so clamping at a short month never carries forward.
 */
export function occurrenceDate(anchorDate: string, freq: RecurringFreq, n: number): string {
  if (!isValidLocalDate(anchorDate)) {
    throw new RangeError(`occurrenceDate: "${anchorDate}" is not a valid local date`);
  }
  if (!isRecurringFreq(freq)) {
    throw new RangeError(`occurrenceDate: "${String(freq)}" is not a valid recurring frequency`);
  }
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`occurrenceDate: n must be a non-negative integer, got ${n}`);
  }

  return isDayBasedFreq(freq)
    ? occurrenceDateDayBased(anchorDate, freq, n)
    : occurrenceDateMonthBased(anchorDate, freq, n);
}

function daysBetween(a: string, b: string): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

function monthsBetween(a: string, b: string): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

/**
 * Every {n, date} occurrence with fromInclusive <= date <= toInclusive, n
 * ascending, honouring an optional inclusive end date and/or occurrence
 * count (whichever limit is reached first wins). Never returns more than
 * MAX_OCCURRENCES_PER_CALL results.
 */
export function occurrencesBetween(
  schedule: RecurringSchedule,
  fromInclusive: string,
  toInclusive: string
): { n: number; date: string }[] {
  if (!isValidLocalDate(fromInclusive)) {
    throw new RangeError(`occurrencesBetween: "${fromInclusive}" is not a valid local date`);
  }
  if (!isValidLocalDate(toInclusive)) {
    throw new RangeError(`occurrencesBetween: "${toInclusive}" is not a valid local date`);
  }

  const results: { n: number; date: string }[] = [];
  if (toInclusive < fromInclusive) return results;

  const startN = isDayBasedFreq(schedule.freq)
    ? Math.max(0, Math.floor(daysBetween(schedule.anchorDate, fromInclusive) / STEP_DAYS[schedule.freq]))
    : Math.max(0, monthsBetween(schedule.anchorDate, fromInclusive) - 1);

  const maxN = schedule.occurrenceCount ?? Infinity;

  let n = startN;
  while (n < maxN && results.length < MAX_OCCURRENCES_PER_CALL) {
    const date = occurrenceDate(schedule.anchorDate, schedule.freq, n);
    if (date > toInclusive) break;
    if (schedule.endDate && date > schedule.endDate) break;
    if (date >= fromInclusive) results.push({ n, date });
    n += 1;
  }

  return results;
}

/**
 * The last day of the month after `today`'s month (D-03): the current and
 * next month always hold real materialised rows.
 */
export function materialisationHorizon(today: string): string {
  if (!isValidLocalDate(today)) {
    throw new RangeError(`materialisationHorizon: "${today}" is not a valid local date`);
  }
  const { year, month } = parseLocalDate(today);
  // First of the month, +2 months, -1 day = the last day of next month.
  const firstPlus2 = new Date(Date.UTC(year, month - 1 + 2, 1));
  const horizon = new Date(
    Date.UTC(firstPlus2.getUTCFullYear(), firstPlus2.getUTCMonth(), firstPlus2.getUTCDate() - 1)
  );
  return formatLocalDate(horizon.getUTCFullYear(), horizon.getUTCMonth() + 1, horizon.getUTCDate());
}

/**
 * Dates the schedule lands on inside `month`, strictly after afterExclusive
 * when given (null means no lower bound).
 */
export function projectOccurrences(
  schedule: RecurringSchedule,
  month: string,
  afterExclusive: string | null
): string[] {
  const { start, endExclusive } = monthRange(month);
  const { year, month: m, day } = parseLocalDate(endExclusive);
  const dt = new Date(Date.UTC(year, m - 1, day - 1));
  const lastDayOfMonth = formatLocalDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

  return occurrencesBetween(schedule, start, lastDayOfMonth)
    .map((o) => o.date)
    .filter((date) => afterExclusive === null || date > afterExclusive);
}
