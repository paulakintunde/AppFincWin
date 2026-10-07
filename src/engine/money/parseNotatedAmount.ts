/**
 * Statement amount-notation reading (D-43, REC-14).
 *
 * `parseAmount` (untouched by this file) is the strict, sign-free parser for
 * the entry sheet, where direction always comes from an explicit
 * Expense/Income/Transfer toggle. A statement file is different: the same
 * cell can carry its sign as a leading or trailing minus, a true minus sign
 * (U+2212) or an en dash (U+2013), parentheses, a DR/CR/D/C marker, an OD
 * marker, or nothing at all. `parseNotatedAmount` reads all of that into a
 * non-negative magnitude plus a typed marker -- it never decides what the
 * marker *means*. That decision belongs to the file's format profile
 * (engine/statement/convert.ts, plan 02-36), which is the one place D-44's
 * stored-sign rule is applied. Two markers that disagree (e.g. '-12.50 CR')
 * are a typed 'conflicting-markers' error, never a guess.
 *
 * Every step here is string scanning with no floating-point coercion of
 * unvalidated input -- the same discipline as `parseAmount` -- and the
 * amount itself is always handed to the unmodified `parseAmount` for the
 * final digit-to-MinorUnits conversion, so MON-01/MON-13 keep holding.
 */
import { parseAmount, type ParseError } from './parseAmount';
import { type MinorUnits } from './types';

export type AmountMarker = 'none' | 'plus' | 'minus' | 'parens' | 'dr' | 'cr' | 'od';

export interface NumberNotation {
  decimal: '.' | ',';
  // ' ' also accepts the NBSP/narrow-NBSP whitespace set parseAmount already
  // treats as grouping; "'" also accepts the U+2019 form (normalised below).
  group: ',' | '.' | ' ' | "'";
  grouping: 'western' | 'indian'; // chooses a file-neutral locale for parseAmount's group-placement check
}

export type NotatedAmountError = ParseError | 'conflicting-markers';

export type NotatedAmountResult =
  | { ok: true; magnitude: MinorUnits; marker: AmountMarker }
  | { ok: false; error: NotatedAmountError };

// Padding this parser strips before it does anything else: ASCII whitespace,
// NBSP (U+00A0), narrow NBSP (U+202F), figure space (U+2007), and the
// zero-width characters some exports leave behind (U+200B/U+200C/U+200D,
// plus a stray non-leading BOM U+FEFF).
const PAD_CHARS = new Set([
  ' ', '\t', '\n', '\r', ' ', ' ', ' ', '​', '‌', '‍', '﻿',
]);

function stripPad(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && PAD_CHARS.has(s[start] as string)) start += 1;
  while (end > start && PAD_CHARS.has(s[end - 1] as string)) end -= 1;
  return s.slice(start, end);
}

// Unwraps a spreadsheet `="…"` wrapper, then a plain `"…"` wrapper, each
// re-stripped so padding left inside the wrapper is not mistaken for content.
function stripWrappers(raw: string): string {
  let s = stripPad(raw);
  if (s.length >= 3 && s[0] === '=' && s[1] === '"' && s[s.length - 1] === '"') {
    s = stripPad(s.slice(2, -1));
  }
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    s = stripPad(s.slice(1, -1));
  }
  return s;
}

// Callers only ever pass a character at an index already proven in-bounds
// (the `s.length > token.length` guard at each call site), so there is no
// string-edge case to handle here.
function isBoundary(ch: string): boolean {
  if (ch >= '0' && ch <= '9') return true;
  return PAD_CHARS.has(ch);
}

const CURRENCY_SYMBOL_RE = /^\p{Sc}$/u;
function isCurrencySymbolChar(ch: string | undefined): boolean {
  return ch !== undefined && CURRENCY_SYMBOL_RE.test(ch);
}

// Longest/most-specific tokens first so a 1-char 'D'/'C' never preempts a
// 2-char 'DR'/'CR'/'OD' match ending in the same letter.
const TRAILING_TOKENS: ReadonlyArray<{ token: string; marker: AmountMarker }> = [
  { token: 'OD', marker: 'od' },
  { token: 'od', marker: 'od' },
  { token: 'DR', marker: 'dr' },
  { token: 'Dr', marker: 'dr' },
  { token: 'dr', marker: 'dr' },
  { token: 'CR', marker: 'cr' },
  { token: 'Cr', marker: 'cr' },
  { token: 'cr', marker: 'cr' },
  { token: 'D', marker: 'dr' },
  { token: 'C', marker: 'cr' },
];

// OD is a balance-only, trailing-only marker (per spec) -- never a leading token.
const LEADING_TOKENS: ReadonlyArray<{ token: string; marker: AmountMarker }> = [
  { token: 'DR', marker: 'dr' },
  { token: 'Dr', marker: 'dr' },
  { token: 'dr', marker: 'dr' },
  { token: 'CR', marker: 'cr' },
  { token: 'Cr', marker: 'cr' },
  { token: 'cr', marker: 'cr' },
  { token: 'D', marker: 'dr' },
  { token: 'C', marker: 'cr' },
];

function matchTrailingWord(s: string): { marker: AmountMarker; length: number } | null {
  for (const { token, marker } of TRAILING_TOKENS) {
    const start = s.length - token.length;
    if (s.length > token.length && s.slice(start) === token && isBoundary(s[start - 1] as string)) {
      return { marker, length: token.length };
    }
  }
  return null;
}

function matchLeadingWord(s: string): { marker: AmountMarker; length: number } | null {
  for (const { token, marker } of LEADING_TOKENS) {
    if (s.length > token.length && s.slice(0, token.length) === token && isBoundary(s[token.length] as string)) {
      return { marker, length: token.length };
    }
  }
  return null;
}

// A 3-letter upper-case run at either end, separated from the amount by
// optional whitespace -- an ISO currency code. The run must be *exactly* 3
// letters (never a prefix/suffix of a longer word) so '12.50 XYZQ' is left
// untouched and falls through to 'invalid'.
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
 * Peels every marker token (sign, parentheses, DR/CR/OD, currency symbol,
 * ISO code) from both ends, repeatedly, until a pass finds nothing left to
 * remove. Returns the remaining "bare" number string plus every marker token
 * collected along the way (order of collection, not precedence).
 */
function peelMarkers(input: string): { rest: string; markers: AmountMarker[] } {
  let s = input;
  const markers: AmountMarker[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    s = stripPad(s);
    if (s.length === 0) break;

    if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
      markers.push('parens');
      s = s.slice(1, -1);
      changed = true;
      continue;
    }

    const first = s[0];
    if (first === '-' || first === '−' || first === '–') {
      markers.push('minus');
      s = s.slice(1);
      changed = true;
      continue;
    }
    if (first === '+') {
      markers.push('plus');
      s = s.slice(1);
      changed = true;
      continue;
    }

    const last = s[s.length - 1];
    if (last === '-') {
      markers.push('minus');
      s = s.slice(0, -1);
      changed = true;
      continue;
    }

    const trailingWord = matchTrailingWord(s);
    if (trailingWord !== null) {
      markers.push(trailingWord.marker);
      s = s.slice(0, s.length - trailingWord.length);
      changed = true;
      continue;
    }

    const leadingWord = matchLeadingWord(s);
    if (leadingWord !== null) {
      markers.push(leadingWord.marker);
      s = s.slice(leadingWord.length);
      changed = true;
      continue;
    }

    if (s.length > 1 && isCurrencySymbolChar(first)) {
      s = s.slice(1);
      changed = true;
      continue;
    }
    if (s.length > 1 && isCurrencySymbolChar(last)) {
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
  return { rest: s, markers };
}

const MINUS_LIKE = new Set<AmountMarker>(['minus', 'parens', 'dr', 'od']);
const PLUS_LIKE = new Set<AmountMarker>(['plus', 'cr']);
// dr > cr > od > parens > minus > plus > none
const MARKER_PRECEDENCE: readonly AmountMarker[] = ['dr', 'cr', 'od', 'parens', 'minus', 'plus', 'none'];

function resolveMarker(markers: AmountMarker[]): { ok: true; marker: AmountMarker } | { ok: false } {
  const hasMinusLike = markers.some((m) => MINUS_LIKE.has(m));
  const hasPlusLike = markers.some((m) => PLUS_LIKE.has(m));
  if (hasMinusLike && hasPlusLike) return { ok: false };
  for (const candidate of MARKER_PRECEDENCE) {
    if (markers.includes(candidate)) return { ok: true, marker: candidate };
  }
  return { ok: true, marker: 'none' };
}

/**
 * Strips excess trailing-zero decimals beyond `exponent` (Phase 1 D-24,
 * MON-13): '12.500' at exponent 2 is 1250, not a rejection. A non-zero digit
 * beyond `exponent` is still 'too-many-decimals' and is never rounded. Only
 * touches the LAST occurrence of `decimalChar`, and only when it is followed
 * by digits only -- anything else is left for `parseAmount` to judge.
 */
const MAX_ZERO_PADDING = 2;

function stripExcessZeros(
  rest: string,
  decimalChar: string,
  exponent: number
): { ok: true; value: string } | { ok: false } {
  const idx = rest.lastIndexOf(decimalChar);
  if (idx === -1) return { ok: true, value: rest };
  const fraction = rest.slice(idx + 1);
  if (fraction.length === 0) return { ok: true, value: rest };
  for (const ch of fraction) {
    if (ch < '0' || ch > '9') return { ok: true, value: rest };
  }
  if (fraction.length <= exponent) return { ok: true, value: rest };
  const excess = fraction.slice(exponent);
  // Padding is at most two extra places (OFX pads 2 dp to 4). Three or more
  // trailing zeros past the exponent look like a misread thousands group
  // ('1.000' at exponent 0), so they are refused, never divided away
  // (review E-WR-03).
  if (excess.length > MAX_ZERO_PADDING) return { ok: false };
  for (const ch of excess) {
    if (ch !== '0') return { ok: false };
  }
  return { ok: true, value: rest.slice(0, idx + 1) + fraction.slice(0, exponent) };
}

/** minus/parens/dr/od -> -1 (money out / owed); none/plus/cr -> +1 (money in / held). */
export function markerSign(marker: AmountMarker): 1 | -1 {
  return MINUS_LIKE.has(marker) ? -1 : 1;
}

export function parseNotatedAmount(
  raw: string,
  notation: NumberNotation,
  exponent: number
): NotatedAmountResult {
  const stripped = stripWrappers(raw);
  if (stripped === '') return { ok: false, error: 'empty' };

  const { rest, markers } = peelMarkers(stripped);
  const resolved = resolveMarker(markers);
  if (!resolved.ok) return { ok: false, error: 'conflicting-markers' };

  if (rest === '') return { ok: false, error: 'invalid' };

  // Swiss/curly apostrophe grouping (U+2019) reads the same as a plain '.
  const normalized = rest.replace(/’/g, "'");

  const trimmed = stripExcessZeros(normalized, notation.decimal, exponent);
  if (!trimmed.ok) return { ok: false, error: 'too-many-decimals' };

  const parsed = parseAmount(trimmed.value, {
    locale: notation.grouping === 'indian' ? 'en-IN' : 'en-US',
    exponent,
    separators: { decimal: notation.decimal, group: notation.group },
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, magnitude: parsed.value, marker: resolved.marker };
}
