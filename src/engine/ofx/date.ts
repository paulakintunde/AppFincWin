/**
 * OFX date reading (D-39, MON-14; RESEARCH §A1 "Dates").
 *
 * The format is `YYYYMMDD[HHMMSS[.XXX]][[gmt offset[:tz name]]]`, e.g.
 * `20260912120000.000[-5:EST]`. `ofxLocalDate` takes the local date from the
 * first 8 characters exactly as written and never builds a JavaScript date
 * instant from it: reading `20260912000000` as GMT and converting to a
 * western time zone would move the row to 11 September, and MON-14 already
 * establishes that a transaction happens on a calendar day, not an instant.
 * The optional time and offset are grammar-checked here only to reject
 * malformed input -- their values are read and then discarded, never used to
 * shift the date.
 */
import { isValidLocalDate } from '../time/localDate';

function isAsciiDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

// Every call site guards its own length before calling this (see
// `isValidTimePart` and `ofxLocalDate` below), so `s` is always non-empty
// here -- there is no reachable case where the loop runs zero times.
function isDigitRun(s: string): boolean {
  for (const ch of s) {
    if (!isAsciiDigit(ch)) return false;
  }
  return true;
}

function isAsciiLetter(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

/** `HHMMSS` (exactly 6 digits) optionally followed by `.` and 1-3 fractional digits. */
function isValidTimePart(s: string): boolean {
  if (s.length < 6 || !isDigitRun(s.slice(0, 6))) return false;
  const rest = s.slice(6);
  if (rest.length === 0) return true;
  if (rest[0] !== '.') return false;
  const frac = rest.slice(1);
  return frac.length >= 1 && frac.length <= 3 && isDigitRun(frac);
}

/**
 * The content of the trailing `[...]` bracket: an optional sign, 1-2 digits,
 * an optional `.` plus 1-2 fractional digits (a fractional GMT offset such as
 * `+5.30`), then an optional `:` plus 1+ letters (a time-zone name such as
 * `EST` or `GMT`).
 */
function isValidOffsetContent(s: string): boolean {
  let i = 0;
  if (s[i] === '+' || s[i] === '-') i += 1;

  const digitsStart = i;
  while (i < s.length && isAsciiDigit(s[i] as string)) i += 1;
  if (i - digitsStart < 1 || i - digitsStart > 2) return false;

  if (s[i] === '.') {
    i += 1;
    const fracStart = i;
    while (i < s.length && isAsciiDigit(s[i] as string)) i += 1;
    if (i - fracStart < 1 || i - fracStart > 2) return false;
  }

  if (s[i] === ':') {
    i += 1;
    const nameStart = i;
    while (i < s.length && isAsciiLetter(s[i] as string)) i += 1;
    if (i - nameStart < 1) return false;
  }

  return i === s.length;
}

function isValidRemainder(remainder: string): boolean {
  if (remainder === '') return true;

  const bracketStart = remainder.indexOf('[');
  const timePart = bracketStart === -1 ? remainder : remainder.slice(0, bracketStart);
  if (timePart !== '' && !isValidTimePart(timePart)) return false;
  if (bracketStart === -1) return true;

  const bracketPart = remainder.slice(bracketStart);
  if (bracketPart.length < 2 || bracketPart[bracketPart.length - 1] !== ']') return false;
  return isValidOffsetContent(bracketPart.slice(1, -1));
}

/**
 * Reads `raw`'s first 8 characters as a local date (RESEARCH §A1). Returns
 * `null` when those characters are not all digits, when the date they spell
 * is not a real calendar date, or when anything after them fails the
 * `[HHMMSS[.XXX]][[±H[.MM]][:TZ]]` grammar.
 */
export function ofxLocalDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 8 || !isDigitRun(trimmed.slice(0, 8))) return null;

  const localDate = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  if (!isValidLocalDate(localDate)) return null;

  const remainder = trimmed.slice(8);
  if (!isValidRemainder(remainder)) return null;

  return localDate;
}
