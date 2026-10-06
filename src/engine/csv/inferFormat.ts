/**
 * Date-format and number-notation inference from a CSV file's own sample
 * rows (D-11, RESEARCH §A3 separator traps). Every guess is explicit about
 * ambiguity rather than defaulting silently -- an undecidable date sample
 * comes back `{ kind: 'ambiguous' }`, never a guessed DMY/MDY, and every
 * grouping decision is read from the file's own digits, never from the
 * platform's locale-formatting APIs or the device's configured region, so
 * an en-IN user importing a UK file and a UK user importing an Indian one
 * both read correctly.
 *
 * Every digit-string-to-integer conversion here is a manual char-code
 * accumulation (`digitsToInt` below), never JavaScript's built-in numeric
 * coercion -- the same float-free discipline `engine/money/parseAmount.ts`
 * uses, kept even though these are calendar digits, not money.
 */
import { isValidLocalDate } from '../time/localDate';
import type { NumberNotation } from '../money';

export type DateFormat = 'YMD' | 'DMY' | 'MDY';

export type DateFormatGuess =
  | { kind: 'certain'; format: DateFormat }
  | { kind: 'ambiguous'; candidates: DateFormat[] }
  | { kind: 'none' };

export type DecimalMark = '.' | ',';

export type DecimalMarkGuess = { kind: 'certain'; mark: DecimalMark } | { kind: 'ambiguous' };

export type NotationGuess =
  | { kind: 'certain'; notation: NumberNotation }
  | { kind: 'mixed-grouping'; notation: NumberNotation }
  | { kind: 'ambiguous'; candidates: [NumberNotation, NumberNotation] };

// ---- shared helpers -------------------------------------------------------

function isAllDigits(s: string): boolean {
  return s.length > 0 && /^[0-9]+$/.test(s);
}

/** Converts a validated all-digit string to an integer via char-code accumulation only. */
function digitsToInt(s: string): number {
  let n = 0;
  for (const ch of s) {
    n = n * 10 + (ch.charCodeAt(0) - 48);
  }
  return n;
}

function padStart2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ---- date-format inference -------------------------------------------------

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthNumberFor(part: string): number | undefined {
  return MONTH_NAMES[part.toLowerCase()];
}

function splitDateParts(raw: string): string[] | null {
  let s = raw.trim();
  if (s === '') return null;

  const tIdx = s.indexOf('T');
  if (tIdx > 0) s = s.slice(0, tIdx);

  const spaceTime = s.match(/^(.*)\s+\d{1,2}:\d{2}/);
  if (spaceTime) s = spaceTime[1] as string;

  s = s.trim();
  const parts = s.split(/[/\-. ]+/).filter((p) => p.length > 0);
  return parts.length === 3 ? parts : null;
}

type DateRole = 'year' | 'month' | 'day';
const FORMAT_ROLES: Readonly<Record<DateFormat, readonly [DateRole, DateRole, DateRole]>> = {
  YMD: ['year', 'month', 'day'],
  DMY: ['day', 'month', 'year'],
  MDY: ['month', 'day', 'year'],
};

// Every branch below assigns exactly one value per role -- month directly
// (month-name path) or via a loop that walks every remaining/all-three role
// exactly once -- so by the time either loop finishes without an early
// `null` return, `values` always holds all three keys. No runtime
// "still undefined" check is needed (or reachable) after that.
function assembleFromParts(
  parts: readonly string[],
  format: DateFormat
): { year: number; month: number; day: number } | null {
  const roles = FORMAT_ROLES[format];
  const monthNameIdx = parts.findIndex((p) => monthNumberFor(p) !== undefined);
  const values: Partial<Record<DateRole, number>> = {};
  let yearDigits = 0;

  if (monthNameIdx !== -1) {
    values.month = monthNumberFor(parts[monthNameIdx] as string) as number;
    // The other two parts keep the format's day/year order among themselves,
    // regardless of which slot the spelled-out month landed in.
    const remainingRoles = roles.filter((r) => r !== 'month');
    const remainingIndices = [0, 1, 2].filter((i) => i !== monthNameIdx);
    for (let k = 0; k < remainingIndices.length; k += 1) {
      const idx = remainingIndices[k] as number;
      const role = remainingRoles[k] as DateRole;
      const value = parts[idx] as string;
      if (!isAllDigits(value)) return null;
      values[role] = digitsToInt(value);
      if (role === 'year') yearDigits = value.length;
    }
  } else {
    for (let i = 0; i < 3; i += 1) {
      const value = parts[i] as string;
      if (!isAllDigits(value)) return null;
      values[roles[i] as DateRole] = digitsToInt(value);
      if (roles[i] === 'year') yearDigits = value.length;
    }
  }

  // Review E-CR-02: a year is 4 digits, or 2 digits in the trailing position
  // only (dd/mm/yy, mm/dd/yy). A leading 2-digit "year" would let every
  // dd/mm/yy sample in 2026-2031 also parse as yy/mm/dd, so YMD demands 4.
  if (yearDigits !== 4 && (format === 'YMD' || yearDigits !== 2)) return null;
  let year = values.year as number;
  const month = values.month as number;
  const day = values.day as number;
  if (yearDigits === 2) year += 2000;
  if (year < 1900 || year > 2100) return null;

  return { year, month, day };
}

export function parseCsvDate(raw: string, format: DateFormat): string | null {
  const parts = splitDateParts(raw);
  if (parts === null) return null;
  const assembled = assembleFromParts(parts, format);
  if (assembled === null) return null;
  if (assembled.month < 1 || assembled.month > 12) return null;
  // `assembled.year` is always in 1900..2100 here (checked above), so it is
  // always exactly 4 digits already -- no padding is ever needed for it.
  const ymd = `${assembled.year}-${padStart2(assembled.month)}-${padStart2(assembled.day)}`;
  return isValidLocalDate(ymd) ? ymd : null;
}

const DATE_FORMATS: readonly DateFormat[] = ['YMD', 'DMY', 'MDY'];

export function inferDateFormat(samples: readonly string[]): DateFormatGuess {
  const nonEmpty = samples.filter((s) => s.trim() !== '');
  if (nonEmpty.length === 0) return { kind: 'none' };

  const candidates = DATE_FORMATS.filter((format) => nonEmpty.every((s) => parseCsvDate(s, format) !== null));

  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'certain', format: candidates[0] as DateFormat };
  // More than one reading fits every sample: the user is asked (D-11). YMD
  // is never preferred by tie-break (review E-CR-02).
  return { kind: 'ambiguous', candidates };
}

// ---- shared sample cleaning (decimal-mark and notation inference) --------

const PAD_CHARS = new Set([' ', '\t', '\n', '\r', ' ', ' ', ' ']);

function stripPad(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && PAD_CHARS.has(s[start] as string)) start += 1;
  while (end > start && PAD_CHARS.has(s[end - 1] as string)) end -= 1;
  return s.slice(start, end);
}

// Every call site below only ever indexes at a position already proven
// in-bounds by its own `s.length > token.length` guard, so there is no
// string-edge (undefined) case to handle here (mirrors
// engine/money/parseNotatedAmount.ts's own `isBoundary`).
function isBoundary(ch: string): boolean {
  if (ch >= '0' && ch <= '9') return true;
  return PAD_CHARS.has(ch);
}

const CURRENCY_SYMBOL_RE = /^\p{Sc}$/u;
function isCurrencySymbolChar(ch: string | undefined): boolean {
  return ch !== undefined && CURRENCY_SYMBOL_RE.test(ch);
}

// Longest/most-specific first so a 1-char 'D'/'C' never preempts 'DR'/'CR'/'OD'.
const WORD_TOKENS: readonly string[] = ['OD', 'od', 'DR', 'Dr', 'dr', 'CR', 'Cr', 'cr', 'D', 'C'];

function stripTrailingWordToken(s: string): string | null {
  for (const token of WORD_TOKENS) {
    const start = s.length - token.length;
    if (s.length > token.length && s.slice(start) === token && isBoundary(s[start - 1] as string)) {
      return s.slice(0, start);
    }
  }
  return null;
}

function stripLeadingWordToken(s: string): string | null {
  for (const token of WORD_TOKENS) {
    if (s.length > token.length && s.slice(0, token.length) === token && isBoundary(s[token.length] as string)) {
      return s.slice(token.length);
    }
  }
  return null;
}

function matchLeadingIso(s: string): number | null {
  let i = 0;
  while (i < s.length && (s[i] as string) >= 'A' && (s[i] as string) <= 'Z') i += 1;
  if (i !== 3) return null;
  let len = i;
  while (len < s.length && PAD_CHARS.has(s[len] as string)) len += 1;
  if (len >= s.length) return null;
  return len;
}

function matchTrailingIso(s: string): number | null {
  let i = s.length;
  while (i > 0 && (s[i - 1] as string) >= 'A' && (s[i - 1] as string) <= 'Z') i -= 1;
  const runLength = s.length - i;
  if (runLength !== 3) return null;
  let start = i;
  while (start > 0 && PAD_CHARS.has(s[start - 1] as string)) start -= 1;
  if (start <= 0) return null;
  return s.length - start;
}

/**
 * Strips sign/currency/DR-CR-OD/parentheses/ISO-code decorations from a raw
 * amount-like sample, repeatedly, until nothing more can be removed, and
 * normalises curly-apostrophe and NBSP-family whitespace. Never interprets
 * the remaining digits -- callers only ever look at separator placement.
 */
function cleanSample(raw: string): string {
  let s = raw.replace(/’/g, "'").replace(/[   ]/g, ' ');
  let changed = true;
  while (changed) {
    changed = false;
    s = stripPad(s);
    if (s.length === 0) break;

    if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
      s = s.slice(1, -1);
      changed = true;
      continue;
    }

    const first = s[0] as string;
    if (first === '-' || first === '+' || first === '−' || first === '–') {
      s = s.slice(1);
      changed = true;
      continue;
    }
    if (s[s.length - 1] === '-') {
      s = s.slice(0, -1);
      changed = true;
      continue;
    }

    const trailingWord = stripTrailingWordToken(s);
    if (trailingWord !== null) {
      s = trailingWord;
      changed = true;
      continue;
    }
    const leadingWord = stripLeadingWordToken(s);
    if (leadingWord !== null) {
      s = leadingWord;
      changed = true;
      continue;
    }

    if (s.length > 1 && isCurrencySymbolChar(first)) {
      s = s.slice(1);
      changed = true;
      continue;
    }
    if (s.length > 1 && isCurrencySymbolChar(s[s.length - 1])) {
      s = s.slice(0, -1);
      changed = true;
      continue;
    }

    const leadingIso = matchLeadingIso(s);
    if (leadingIso !== null) {
      s = s.slice(leadingIso);
      changed = true;
      continue;
    }
    const trailingIso = matchTrailingIso(s);
    if (trailingIso !== null) {
      s = s.slice(0, s.length - trailingIso);
      changed = true;
      continue;
    }
  }
  return s;
}

// ---- decimal-mark inference -------------------------------------------------

type MarkVote = { kind: 'certain'; mark: DecimalMark } | { kind: 'none' };

function voteForSample(cleaned: string): MarkVote {
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    return { kind: 'certain', mark: lastDot > lastComma ? '.' : ',' };
  }

  if (!hasDot && !hasComma) return { kind: 'none' };

  const mark: DecimalMark = hasDot ? '.' : ',';
  const idx = cleaned.lastIndexOf(mark);
  const after = cleaned.slice(idx + 1);
  if (!isAllDigits(after)) return { kind: 'none' };
  if (after.length === 1 || after.length === 2) return { kind: 'certain', mark };
  return { kind: 'none' }; // exactly 3 (or more) digits after: a group size, not decimal evidence
}

export function inferDecimalMark(samples: readonly string[]): DecimalMarkGuess {
  const votes: DecimalMark[] = [];
  for (const raw of samples) {
    const cleaned = cleanSample(raw);
    if (cleaned === '') continue;
    const vote = voteForSample(cleaned);
    if (vote.kind === 'certain') votes.push(vote.mark);
  }
  if (votes.length === 0) return { kind: 'ambiguous' };

  const dotCount = votes.filter((v) => v === '.').length;
  const commaCount = votes.filter((v) => v === ',').length;
  if (dotCount === commaCount) return { kind: 'ambiguous' };
  return { kind: 'certain', mark: dotCount > commaCount ? '.' : ',' };
}

// ---- number-notation inference ----------------------------------------------

export function notationFor(mark: DecimalMark): NumberNotation {
  return mark === '.'
    ? { decimal: '.', group: ',', grouping: 'western' }
    : { decimal: ',', group: '.', grouping: 'western' };
}

const GROUP_CANDIDATES: readonly NumberNotation['group'][] = [',', '.', ' ', "'"];

type GroupingShape = 'indian' | 'western-deep' | 'none';

function groupingShapeOf(integerPart: string): GroupingShape {
  const groups = integerPart.split(/[^0-9]+/).filter((g) => g.length > 0);
  if (groups.length < 2) return 'none';
  const last = groups[groups.length - 1] as string;
  if (last.length !== 3) return 'none';
  const middle = groups.slice(1, -1);
  if (middle.some((g) => g.length === 2)) return 'indian';
  if (middle.some((g) => g.length === 3)) return 'western-deep';
  return 'none';
}

export function inferNumberNotation(samples: readonly string[]): NotationGuess {
  const decimalGuess = inferDecimalMark(samples);
  if (decimalGuess.kind === 'ambiguous') {
    return { kind: 'ambiguous', candidates: [notationFor('.'), notationFor(',')] };
  }
  const decimal = decimalGuess.mark;

  let groupChar: NumberNotation['group'] | null = null;
  let sawIndian = false;
  let sawWesternDeep = false;

  for (const raw of samples) {
    const cleaned = cleanSample(raw);
    if (cleaned === '') continue;

    const decimalIdx = cleaned.lastIndexOf(decimal);
    const integerPart = decimalIdx === -1 ? cleaned : cleaned.slice(0, decimalIdx);
    if (!/[0-9]/.test(integerPart)) continue;

    for (const candidate of GROUP_CANDIDATES) {
      if (candidate === decimal || groupChar !== null) continue;
      if (candidate === ' ') {
        if (/[ ]/.test(integerPart)) groupChar = ' ';
      } else if (integerPart.includes(candidate)) {
        groupChar = candidate;
      }
    }

    const shape = groupingShapeOf(integerPart);
    if (shape === 'indian') sawIndian = true;
    if (shape === 'western-deep') sawWesternDeep = true;
  }

  const group = groupChar ?? (decimal === '.' ? ',' : '.');

  if (sawIndian && sawWesternDeep) {
    return { kind: 'mixed-grouping', notation: { decimal, group, grouping: 'western' } };
  }
  const grouping: NumberNotation['grouping'] = sawIndian ? 'indian' : 'western';
  return { kind: 'certain', notation: { decimal, group, grouping } };
}
