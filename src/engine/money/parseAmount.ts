/**
 * Region-aware, float-free amount input parsing (MON-02, D-24).
 *
 * D-24: the user's region decides how their own keystrokes are read back. The
 * region's decimal mark is authoritative and its grouping mark is ignored
 * wherever it legally appears -- so '12.5' means twelve-and-a-half in en-US
 * but one hundred twenty-five in de-DE, where '.' is the group mark. This is
 * deliberate, not a bug: Record echoes the parsed amount back to the user
 * before it is ever saved (T-01-03-02), so a region mismatch is caught by
 * the user, not silently miscomputed.
 *
 * The whole pipeline is pure string manipulation. Neither of JavaScript's
 * float-parsing built-ins (the one for a leading numeric prefix, or the one
 * for a whole string) nor `Number()`/`parseInt` are ever called on anything
 * other than a string already proven (by the character-by-character scan
 * below) to contain only ASCII digits -- so there is no path by which
 * IEEE-754 float rounding can enter a money value (MON-01).
 */
import { MAX_ABS_AMOUNT_MINOR, minorUnits, type MinorUnits } from './types';

export interface LocaleSeparators {
  decimal: string;
  group: string;
}

/**
 * Derives the decimal and group-separator characters a given locale actually
 * uses, via `Intl.NumberFormat.formatToParts` -- never hardcoded '.'/','.
 * 1234567.5 is chosen as the probe value because it is guaranteed to produce
 * both a 'decimal' and a 'group' part token for any locale that has one.
 */
export function localeSeparators(locale: string): LocaleSeparators {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  return { decimal, group };
}

export type ParseError = 'empty' | 'invalid' | 'too-many-decimals' | 'too-large';

export type ParseDecimalResult = { ok: true; value: string } | { ok: false; error: ParseError };

export type ParseAmountResult =
  | { ok: true; value: MinorUnits }
  | { ok: false; error: ParseError; maxDecimals: number };

// A locale's group separator is very often a whitespace character, but
// exactly which one Intl reports (plain space, NBSP, narrow NBSP) is not
// worth being strict about -- accept all three whenever the locale's own
// group character is whitespace-like (fr-FR's narrow-no-break-space grouping
// entered as a plain space is still unambiguous to a human typing on a
// keyboard with no narrow-no-break-space key).
const WHITESPACE_GROUP_CHARS = new Set([' ', ' ', ' ']);

function buildGroupCharSet(groupChar: string): ReadonlySet<string> {
  return WHITESPACE_GROUP_CHARS.has(groupChar) ? WHITESPACE_GROUP_CHARS : new Set([groupChar]);
}

// Maps a single character to its ASCII digit if it is an ASCII, Arabic-Indic
// (U+0660-U+0669) or Extended Arabic-Indic (U+06F0-U+06F9) digit; otherwise
// undefined. This is the only place digit characters are interpreted, and it
// only ever produces one of '0'-'9'.
function normalizeDigit(ch: string): string | undefined {
  // `ch` always comes from iterating a non-empty string one character at a
  // time (see the for-of loop below), so index 0 always exists --
  // `charCodeAt` (not the optional `codePointAt`) is used deliberately so
  // there is no spurious "undefined index" branch to cover: every character
  // this function is ever called with has a real code unit at position 0.
  const code = ch.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return ch;
  if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(0x30 + (code - 0x0660));
  if (code >= 0x06f0 && code <= 0x06f9) return String.fromCharCode(0x30 + (code - 0x06f0));
  return undefined;
}

/**
 * Strict region-aware conversion of a free-typed amount string to a
 * canonical ASCII decimal string ('1234.5', no group marks, at most one
 * '.'). Never rounds: a fraction longer than `maxFractionDigits` is rejected
 * outright (MON-13's exponent boundary), not truncated or rounded.
 */
export function parseDecimalString(
  raw: string,
  opts: { locale: string; maxFractionDigits: number }
): ParseDecimalResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  const { decimal, group } = localeSeparators(opts.locale);
  const groupChars = buildGroupCharSet(group);

  let whole = '';
  let fraction = '';
  let inFraction = false;
  let seenDecimal = false;

  for (const ch of trimmed) {
    const digit = normalizeDigit(ch);
    if (digit !== undefined) {
      if (inFraction) fraction += digit;
      else whole += digit;
      continue;
    }

    if (ch === decimal) {
      if (seenDecimal) return { ok: false, error: 'invalid' };
      seenDecimal = true;
      inFraction = true;
      continue;
    }

    if (groupChars.has(ch)) {
      // A group mark is only meaningful (and only ever typed) in the whole
      // part. One appearing after the decimal mark is not a legal grouping
      // -- reject rather than silently drop it.
      if (inFraction) return { ok: false, error: 'invalid' };
      continue;
    }

    // Anything else -- letters, signs (including the true minus U+2212),
    // a stray decimal mark from a different locale -- is not part of a
    // strict amount.
    return { ok: false, error: 'invalid' };
  }

  // Covers '.', a group-mark-only string, and any input with no digits.
  if (whole === '' && fraction === '') return { ok: false, error: 'invalid' };

  if (fraction.length > opts.maxFractionDigits) return { ok: false, error: 'too-many-decimals' };

  // `whole` is guaranteed non-empty here whenever `fraction` is empty (the
  // both-empty case already returned above), so only the fraction-present
  // side needs the empty-whole fallback (e.g. '.5' -> '0.5').
  const value = fraction.length > 0 ? `${whole || '0'}.${fraction}` : whole;
  return { ok: true, value };
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

/**
 * Parses a free-typed amount string into `MinorUnits`, strictly and
 * region-aware, per MON-02/D-24. `exponent` is the target currency's ISO
 * 4217 (or custom-currency, MON-13) minor-unit exponent -- a caller passing
 * an out-of-range exponent has a programming bug, not a user-input problem,
 * so that case throws rather than returning a result.
 */
export function parseAmount(
  raw: string,
  opts: { locale: string; exponent: number }
): ParseAmountResult {
  const { locale, exponent } = opts;
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
    throw new RangeError(`parseAmount: exponent ${exponent} must be an integer between 0 and 4`);
  }

  const parsed = parseDecimalString(raw, { locale, maxFractionDigits: exponent });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, maxDecimals: exponent };
  }

  const [wholePart, fractionPart = ''] = parsed.value.split('.');
  const digits = stripLeadingZeros(`${wholePart}${fractionPart.padEnd(exponent, '0')}`);

  // Bounded by MAX_ABS_AMOUNT_MINOR (1e13, 14 digits): a 16-digit guard is a
  // cheap pre-check before the BigInt comparison, well under
  // Number.MAX_SAFE_INTEGER so the final Number() conversion below is exact.
  if (digits.length > 16 || BigInt(digits) > BigInt(MAX_ABS_AMOUNT_MINOR)) {
    return { ok: false, error: 'too-large', maxDecimals: exponent };
  }

  return { ok: true, value: minorUnits(Number(digits)) };
}
