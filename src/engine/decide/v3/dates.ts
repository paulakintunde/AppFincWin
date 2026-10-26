// Pure calendar maths for v3 (05.1). No clock: every function takes its dates (I16). Cadences outside
// RecurringFreq (every N weeks or months, D-19) live here so recurring/schedule.ts, which is SQL-mirrored,
// never changes.
import { daysInMonth, MAX_OCCURRENCES_PER_CALL } from '../../recurring/schedule';
import { isValidLocalDate } from '../../time/localDate';

/** Structurally identical to Cadence in the v3 types; kept local so this leaf has no types import. */
export interface CadenceLike {
  readonly unit: 'week' | 'month';
  readonly every: number;
}

const MS_PER_DAY = 86_400_000;

function assertDate(date: string, fn: string): void {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`${fn}: "${date}" is not a valid local date`);
  }
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
