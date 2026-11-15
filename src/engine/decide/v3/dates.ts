// Pure calendar maths for v3 (05.1). No clock: every function takes its dates (I16). Cadences outside
// RecurringFreq (every N weeks or months, D-19) live here so recurring/schedule.ts, which is SQL-mirrored,
// never changes.
import { MAX_OCCURRENCES_PER_CALL } from '../../recurring/schedule';
import { addDays, addMonthsClamped, daysBetween, daysInMonth, parseDate } from '../../time/calendar';
import { isValidLocalDate as isValidCalendarDate } from '../../time/localDate';

/** Structurally identical to Cadence in the v3 types; kept local so this leaf has no types import. */
export interface CadenceLike {
  readonly unit: 'week' | 'month';
  readonly every: number;
}

/** L-01: true only for a real calendar date written YYYY-MM-DD ('2026-02-31' is false). */
export function isValidLocalDate(s: string): boolean {
  return isValidCalendarDate(s);
}

function assertDate(date: string, fn: string): void {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`${fn}: "${date}" is not a valid local date`);
  }
}

// The one calendar lives in time/calendar.ts (05.5-10); re-exported so v3 callers keep their import path.
export { addDays, addMonthsClamped, daysBetween, parseDate };

export function assertEvery(c: CadenceLike, fn: string): void {
  if (c.unit !== 'week' && c.unit !== 'month') {
    throw new RangeError(`${fn}: unit "${String(c.unit)}" must be week or month`);
  }
  if (!Number.isInteger(c.every) || c.every < 1 || c.every > 12) {
    throw new RangeError(`${fn}: every ${c.every} must be an integer from 1 to 12`);
  }
}

/** The exact date of occurrence n (n = 0 is the anchor). */
export function cadenceDate(anchor: string, c: CadenceLike, n: number): string {
  assertDate(anchor, 'cadenceDate');
  assertEvery(c, 'cadenceDate');
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`cadenceDate: n must be a non-negative integer, got ${n}`);
  }
  return c.unit === 'week' ? addDays(anchor, 7 * c.every * n) : addMonthsClamped(anchor, c.every * n);
}

export function compareDates(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Occurrence dates with fromInclusive <= date < toExclusive and date <= endInclusive (when given). */
export function cadenceDatesBetween(
  anchor: string,
  c: CadenceLike,
  fromInclusive: string,
  toExclusive: string,
  endInclusive: string | null
): string[] {
  assertDate(anchor, 'cadenceDatesBetween');
  assertDate(fromInclusive, 'cadenceDatesBetween');
  assertDate(toExclusive, 'cadenceDatesBetween');
  if (endInclusive !== null) assertDate(endInclusive, 'cadenceDatesBetween');
  assertEvery(c, 'cadenceDatesBetween');
  const out: string[] = [];
  if (fromInclusive >= toExclusive) return out;
  if (endInclusive !== null && fromInclusive > endInclusive) return out;
  for (let n = 0; ; n++) {
    const date = cadenceDate(anchor, c, n);
    if (date >= toExclusive) break;
    if (endInclusive !== null && date > endInclusive) break;
    if (date >= fromInclusive) {
      out.push(date);
      if (out.length > MAX_OCCURRENCES_PER_CALL) {
        throw new RangeError(`cadenceDatesBetween: more than ${MAX_OCCURRENCES_PER_CALL} occurrences`);
      }
    }
    if (n > 20_000) {
      throw new RangeError('cadenceDatesBetween: window too far from the anchor');
    }
  }
  return out;
}

/** 'YYYY-MM' of a local date. */
export function yearMonthOf(date: string): string {
  const { y, m } = parseDate(date);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

function parseYearMonth(ym: string): { y: number; m: number } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    throw new RangeError(`parseYearMonth: "${ym}" is not a YYYY-MM month`);
  }
  return { y: Number(ym.slice(0, 4)), m: Number(ym.slice(5, 7)) };
}

export function addYearMonths(ym: string, n: number): string {
  if (!Number.isInteger(n)) {
    throw new RangeError(`addYearMonths: n must be an integer, got ${n}`);
  }
  const { y, m } = parseYearMonth(ym);
  const total = m - 1 + n;
  const y2 = y + Math.floor(total / 12);
  const m2 = (((total % 12) + 12) % 12) + 1;
  return `${String(y2).padStart(4, '0')}-${String(m2).padStart(2, '0')}`;
}

export function daysInYearMonth(ym: string): number {
  const { y, m } = parseYearMonth(ym);
  return daysInMonth(y, m);
}

export function dayOfMonth(date: string): number {
  return parseDate(date).d;
}

export function firstOfMonth(ym: string): string {
  parseYearMonth(ym);
  return `${ym}-01`;
}
