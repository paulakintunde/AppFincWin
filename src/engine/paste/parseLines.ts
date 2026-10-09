/**
 * Paste-lines parser (REC-21, CONTEXT D-20/D-21). One pasted item per line: a
 * name and an amount in either order, with an optional date, separated by
 * tabs, commas or spaces. A leading '+' marks income; every other line is an
 * expense (a pasted list carries no other sign convention).
 *
 * Hostile-input discipline (same as csv/tokenize.ts): each line is a single
 * linear character scan, with no backtracking regex over user content, so a
 * pathological paste costs O(n). The line count is checked against
 * MAX_IMPORT_ROWS before any parsing. Amounts only ever go through the strict
 * `parseAmount`; nothing in this folder reads a float (Phase 1 D-24, MON-01).
 * `parseLines` never throws on any string: an unreadable line is returned in
 * `skipped`, never guessed at.
 */
import { MAX_IMPORT_ROWS } from '../csv/tokenize';
import { parseAmount, type LocaleSeparators } from '../money/parseAmount';
import { isValidLocalDate, monthOf } from '../time';

export interface ParsedLine {
  lineNo: number;
  name: string;
  /** Signed minor units: income positive, expense negative. */
  amount: number;
  localDate: string;
  direction: 'in' | 'out';
}

export type PasteSkipReason = 'no-amount' | 'no-name' | 'bad-amount' | 'bad-date';

export interface PasteSkip {
  lineNo: number;
  reason: PasteSkipReason;
}

export type PasteResult =
  | { ok: true; rows: ParsedLine[]; skipped: PasteSkip[] }
  | { ok: false; error: 'too-many-lines'; limit: number };

export interface PasteContext {
  locale: string;
  separators?: LocaleSeparators;
  /** ISO 4217-shaped code; its symbol or code may prefix an amount token. */
  currency: string;
  exponent: number;
  /** Today's local date, 'YYYY-MM-DD'. */
  today: string;
  /** The viewed month, 'YYYY-MM'. */
  month: string;
}

const MAX_NAME_LENGTH = 200;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

interface Token {
  text: string;
  quoted: boolean;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/** True when every character is in `allowed` (a linear scan, no regex). */
function allDigits(s: string, maxLen: number): boolean {
  if (s.length === 0 || s.length > maxLen) return false;
  for (const ch of s) {
    if (!isDigit(ch)) return false;
  }
  return true;
}

/**
 * Splits one line into tokens on spaces, tabs and commas. A comma between two
 * digits stays inside the token (it may be a group mark: '1,234.50'). A
 * double-quoted run is a single token that is never read as an amount or date;
 * '""' inside quotes is a literal quote; an unterminated quote runs to the end.
 */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let inQuote = false;
  const flush = (quoted: boolean) => {
    if (cur !== '') tokens.push({ text: cur, quoted });
    cur = '';
  };
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (inQuote) {
      if (ch !== '"') {
        cur += ch;
      } else if (line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        flush(true);
        inQuote = false;
      }
    } else if (ch === '"') {
      flush(false);
      inQuote = true;
    } else if (ch === ' ' || ch === '\t' || (ch === ',' && !(isDigit(line[i - 1]) && isDigit(line[i + 1])))) {
      flush(false);
    } else {
      cur += ch;
    }
  }
  flush(inQuote);
  return tokens;
}

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  return MONTHS.findIndex((m) => w === m || w === m.slice(0, 3));
}

function pad2(s: string): string {
  return s.padStart(2, '0');
}

type DateRead = { kind: 'none' } | { kind: 'bad' } | { kind: 'date'; iso: string };

const NONE: DateRead = { kind: 'none' };
const BAD: DateRead = { kind: 'bad' };

function dateOrBad(iso: string): DateRead {
  return isValidLocalDate(iso) ? { kind: 'date', iso } : BAD;
}

/** Reads a date from `len` (1 or 2) tokens starting at `start`, if they look like one. */
function readDate(tokens: Token[], start: number, len: number, year: string): DateRead {
  const slice = tokens.slice(start, start + len);
  if (slice.length !== len || slice.some((t) => t.quoted)) return NONE;
  const a = (slice[0] as Token).text;

  if (len === 2) {
    const b = (slice[1] as Token).text;
    const dayFirst = allDigits(a, 2) && monthIndex(b) >= 0;
    const monthFirst = monthIndex(a) >= 0 && allDigits(b, 2);
    if (!dayFirst && !monthFirst) return NONE;
    const m = monthIndex(dayFirst ? b : a) + 1;
    return dateOrBad(`${year}-${pad2(String(m))}-${pad2(dayFirst ? a : b)}`);
  }

  // ISO 'YYYY-MM-DD'.
  if (a.length === 10 && a[4] === '-' && a[7] === '-') {
    const digits = a.slice(0, 4) + a.slice(5, 7) + a.slice(8);
    return allDigits(digits, 8) ? dateOrBad(a) : NONE;
  }

  // 'D/M', accepted only when the day is unambiguous by value (D > 12).
  const slash = a.indexOf('/');
  if (slash > 0 && allDigits(a.slice(0, slash), 2) && allDigits(a.slice(slash + 1), 2)) {
    const d = a.slice(0, slash);
    return d.length === 2 && d > '12'
      ? dateOrBad(`${year}-${pad2(a.slice(slash + 1))}-${d}`)
      : BAD;
  }
  return NONE;
}

/** Looks for one date at the leading or trailing 1-2 tokens; pairs first. */
function extractDate(
  tokens: Token[],
  year: string
): { read: DateRead; rest: Token[] } {
  const n = tokens.length;
  const candidates: [number, number][] = [
    [0, 2],
    [n - 2, 2],
    [0, 1],
    [n - 1, 1],
  ];
  for (const [start, len] of candidates) {
    if (start < 0) continue;
    const read = readDate(tokens, start, len, year);
    if (read.kind !== 'none') {
      return { read, rest: tokens.filter((_, i) => i < start || i >= start + len) };
    }
  }
  return { read: NONE, rest: tokens };
}

/** Strips one leading currency symbol or ISO code of the context currency. */
function stripCurrency(text: string, symbols: readonly string[]): string {
  const lower = text.toLowerCase();
  for (const s of symbols) {
    if (lower.startsWith(s.toLowerCase())) return text.slice(s.length);
  }
  return text;
}

/** Digits, '.', ',' only, with at least one digit (a linear scan). */
function isAmountLike(s: string): boolean {
  let digit = false;
  for (const ch of s) {
    if (isDigit(ch)) digit = true;
    else if (ch !== '.' && ch !== ',') return false;
  }
  return digit;
}

function parseLine(
  line: string,
  lineNo: number,
  ctx: PasteContext,
  symbols: readonly string[],
  defaultDate: string
): ParsedLine | PasteSkip {
  const trimmed = line.trim();
  const income = trimmed.startsWith('+');
  const tokens = tokenizeLine(income ? trimmed.slice(1) : trimmed);

  const { read, rest } = extractDate(tokens, ctx.month.slice(0, 4));
  if (read.kind === 'bad') return { lineNo, reason: 'bad-date' };

  // The last amount-like unquoted token is the amount; the rest is the name.
  const magnitudes = rest.map((t) => {
    if (t.quoted) return '';
    const stripped = stripCurrency(t.text, symbols);
    return stripped.startsWith('-') ? stripped.slice(1) : stripped;
  });
  let amountAt = -1;
  magnitudes.forEach((m, i) => {
    if (isAmountLike(m)) amountAt = i;
  });
  if (amountAt < 0) return { lineNo, reason: 'no-amount' };

  const parsed = parseAmount(magnitudes[amountAt] as string, {
    locale: ctx.locale,
    exponent: ctx.exponent,
    separators: ctx.separators,
  });
  if (!parsed.ok || parsed.value === 0) return { lineNo, reason: 'bad-amount' };

  const name = rest
    .filter((_, i) => i !== amountAt)
    .map((t) => t.text)
    .join(' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (name === '') return { lineNo, reason: 'no-name' };

  return {
    lineNo,
    name,
    amount: income ? parsed.value : -parsed.value,
    localDate: read.kind === 'date' ? read.iso : defaultDate,
    direction: income ? 'in' : 'out',
  };
}

export function parseLines(text: string, ctx: PasteContext): PasteResult {
  const lines = text.split(/\r\n|\r|\n/);
  const nonBlank = lines.filter((l) => l.trim() !== '').length;
  if (nonBlank > MAX_IMPORT_ROWS) {
    return { ok: false, error: 'too-many-lines', limit: MAX_IMPORT_ROWS };
  }

  const symbols = [
    ctx.currency,
    ...new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: ctx.currency })
      .formatToParts(0)
      .filter((p) => p.type === 'currency')
      .map((p) => p.value),
  ];
  const defaultDate = ctx.month === monthOf(ctx.today) ? ctx.today : `${ctx.month}-01`;

  const rows: ParsedLine[] = [];
  const skipped: PasteSkip[] = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    const r = parseLine(line, i + 1, ctx, symbols, defaultDate);
    if ('reason' in r) skipped.push(r);
    else rows.push(r);
  });
  return { ok: true, rows, skipped };
}
