/**
 * Statement dates in the forms banks print them, and D-27 year assignment.
 * A line date often carries no year; it comes from the statement period (by
 * position across a December to January step, in either row order), from a
 * neighbouring line that does carry one, or from an explicit question to the
 * user. Pure: `today` is always a parameter; patterns are anchored with no
 * nested quantifiers and run on short cell strings.
 */

export interface PdfDateParts {
  y: number | null;
  m: number;
  d: number;
}

export type ParsedPdfDate =
  | { kind: 'named'; parts: PdfDateParts }
  | { kind: 'iso'; parts: PdfDateParts & { y: number } }
  | { kind: 'numeric'; p1: number; p2: number; y: number | null };

export const MONTHS: Readonly<Record<string, number>> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;

const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const D_MON_RE = /^(\d{1,2})[ -]([A-Z]{3,9})\.?(?:(?:,? |-)(\d{4}|\d{2}))?$/;
const MON_D_RE = /^([A-Z]{3,9})\.?[ -](\d{1,2})(?:(?:,? |-)(\d{4}))?$/;
const NUMERIC_RE = /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?$/;

function monthLength(y: number | null, m: number): number {
  return new Date(Date.UTC(y ?? 2000, m, 0)).getUTCDate();
}

function validDay(y: number | null, m: number, d: number): boolean {
  if (y !== null && (y < MIN_YEAR || y > MAX_YEAR)) return false;
  return m >= 1 && m <= 12 && d >= 1 && d <= monthLength(y, m);
}

function fullYear(text: string | undefined): number | null {
  if (text === undefined) return null;
  const n = Number(text);
  return text.length === 2 ? 2000 + n : n;
}

function named(y: number | null, m: number | undefined, d: number): ParsedPdfDate | null {
  if (m === undefined || !validDay(y, m, d)) return null;
  return { kind: 'named', parts: { y, m, d } };
}

export function parsePdfDate(text: string): ParsedPdfDate | null {
  const s = text.trim().replace(/\s+/g, ' ').toUpperCase();
  const iso = ISO_RE.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return validDay(y, m, d) ? { kind: 'iso', parts: { y, m, d } } : null;
  }
  const dm = D_MON_RE.exec(s);
  if (dm) return named(fullYear(dm[3]), MONTHS[dm[2] as string], Number(dm[1]));
  const md = MON_D_RE.exec(s);
  if (md) return named(fullYear(md[3]), MONTHS[md[1] as string], Number(md[2]));
  const num = NUMERIC_RE.exec(s);
  if (num) {
    const p1 = Number(num[1]);
    const p2 = Number(num[3]);
    const y = fullYear(num[4]);
    // A dotted pair with no year is far more often an amount (3.05) than a date.
    if (num[2] === '.' && y === null) return null;
    if (!validDay(y, p2, p1) && !validDay(y, p1, p2)) return null;
    return { kind: 'numeric', p1, p2, y };
  }
  return null;
}

export function looksLikeDate(text: string): boolean {
  return parsePdfDate(text) !== null;
}

export function numericOrder(samples: readonly { p1: number; p2: number }[]): 'DMY' | 'MDY' | 'ambiguous' | 'invalid' {
  const dmy = samples.some((s) => s.p1 > 12);
  const mdy = samples.some((s) => s.p2 > 12);
  if (dmy && mdy) return 'invalid';
  if (dmy) return 'DMY';
  if (mdy) return 'MDY';
  return 'ambiguous';
}

export function resolveNumeric(n: { p1: number; p2: number; y: number | null }, order: 'DMY' | 'MDY'): PdfDateParts | null {
  const d = order === 'DMY' ? n.p1 : n.p2;
  const m = order === 'DMY' ? n.p2 : n.p1;
  return validDay(n.y, m, d) ? { y: n.y, m, d } : null;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dayNumber(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function isoDayNumber(s: string): number {
  return dayNumber(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10)));
}

function leadingDate(tokens: string[]): ParsedPdfDate | null {
  for (let n = Math.min(4, tokens.length); n >= 1; n -= 1) {
    const hit = parsePdfDate(tokens.slice(0, n).join(' '));
    if (hit) return hit;
  }
  return null;
}

function trailingDate(tokens: string[]): ParsedPdfDate | null {
  for (let n = Math.min(4, tokens.length); n >= 1; n -= 1) {
    const hit = parsePdfDate(tokens.slice(tokens.length - n).join(' '));
    if (hit) return hit;
  }
  return null;
}

function toParts(p: ParsedPdfDate, order: 'DMY' | 'MDY'): PdfDateParts | null {
  return p.kind === 'numeric' ? resolveNumeric(p, order) : p.parts;
}

export function parsePeriod(text: string, dayFirst: boolean): { start: string; end: string } | null {
  const s = text.trim().replace(/\s+/g, ' ');
  for (const sep of s.matchAll(/ (?:to|until|-|–) /gi)) {
    const at = sep.index;
    const left = trailingDate(s.slice(0, at).split(' '));
    const right = leadingDate(s.slice(at + sep[0].length).split(' '));
    if (!left || !right) continue;
    const numerics = [left, right].filter((p): p is Extract<ParsedPdfDate, { kind: 'numeric' }> => p.kind === 'numeric');
    const found = numericOrder(numerics);
    if (found === 'invalid') continue;
    const order = found === 'ambiguous' ? (dayFirst ? 'DMY' : 'MDY') : found;
    const a = toParts(left, order);
    const b = toParts(right, order);
    if (!a || !b || a.y === null || b.y === null) continue;
    const start = iso(a.y, a.m, a.d);
    const end = iso(b.y, b.m, b.d);
    if (end >= start) return { start, end };
  }
  return null;
}

export interface YearAssignment {
  dates: (string | null)[];
  outOfPeriod: boolean[];
  question: [number, number] | null;
}

function inWindow(y: number, m: number, d: number, start: string, end: string): boolean {
  const n = dayNumber(y, m, d);
  return n >= isoDayNumber(start) - WINDOW_DAYS && n <= isoDayNumber(end) + WINDOW_DAYS;
}

function assignFromPeriod(parts: readonly (PdfDateParts | null)[], start: string, end: string): YearAssignment {
  const years = [Number(start.slice(0, 4)), Number(end.slice(0, 4))];
  const dates: (string | null)[] = [];
  const outOfPeriod: boolean[] = [];
  for (const p of parts) {
    if (p === null) {
      dates.push(null);
      outOfPeriod.push(false);
      continue;
    }
    const candidates = p.y === null ? years : [p.y];
    const fits = candidates.find((y) => validDay(y, p.m, p.d) && inWindow(y, p.m, p.d, start, end));
    const fallback = candidates.find((y) => validDay(y, p.m, p.d));
    const year = fits ?? fallback;
    dates.push(year === undefined ? null : iso(year, p.m, p.d));
    outOfPeriod.push(fits === undefined);
  }
  return { dates, outOfPeriod, question: null };
}

// Year of a line given its neighbour's month and year: a drop of six months or
// more means the year turned over (oldest-first), a rise of six or more means it
// turned back (newest-first). `forward` is the walk direction through the file.
function shiftYear(year: number, neighbourMonth: number, month: number, forward: boolean): number {
  const drop = forward ? neighbourMonth - month : month - neighbourMonth;
  const rise = forward ? month - neighbourMonth : neighbourMonth - month;
  if (drop >= 6) return year + (forward ? 1 : -1);
  if (rise >= 6) return year + (forward ? -1 : 1);
  return year;
}

export function assignYears(
  parts: readonly (PdfDateParts | null)[],
  period: { start: string | null; end: string | null },
  opts: { today: string; firstRowYear: number | null }
): YearAssignment {
  if (period.start !== null && period.end !== null) return assignFromPeriod(parts, period.start, period.end);

  const years: (number | null)[] = parts.map((p) => (p === null ? null : p.y));
  const firstNonNull = parts.findIndex((p) => p !== null);
  if (firstNonNull === -1) return { dates: parts.map(() => null), outOfPeriod: parts.map(() => false), question: null };

  const explicit = parts.findIndex((p) => p !== null && p.y !== null);
  const todayYear = Number(opts.today.slice(0, 4));
  let question: [number, number] | null = null;
  let anchor = explicit;
  if (explicit === -1) {
    anchor = firstNonNull;
    years[anchor] = opts.firstRowYear ?? todayYear;
    if (opts.firstRowYear === null) question = [todayYear - 1, todayYear];
  }

  let year = years[anchor] as number;
  let month = (parts[anchor] as PdfDateParts).m;
  for (let i = anchor + 1; i < parts.length; i += 1) {
    const p = parts[i] as PdfDateParts | null;
    if (p === null) continue;
    year = p.y ?? shiftYear(year, month, p.m, true);
    years[i] = year;
    month = p.m;
  }
  year = years[anchor] as number;
  month = (parts[anchor] as PdfDateParts).m;
  for (let i = anchor - 1; i >= 0; i -= 1) {
    const p = parts[i] as PdfDateParts | null;
    if (p === null) continue;
    year = shiftYear(year, month, p.m, false);
    years[i] = year;
    month = p.m;
  }

  const dates = parts.map((p, i) => {
    const y = years[i] as number | null;
    if (p === null || y === null || !validDay(y, p.m, p.d)) return null;
    return iso(y, p.m, p.d);
  });
  return { dates, outOfPeriod: parts.map((p, i) => p !== null && dates[i] === null), question };
}
