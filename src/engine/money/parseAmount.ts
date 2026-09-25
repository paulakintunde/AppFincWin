/**
 * Region-aware, float-free amount input parsing (MON-02, D-24).
 *
 * D-24: the user's region decides how their own keystrokes are read back. The
 * region's decimal mark is authoritative, and its grouping mark is accepted
 * only where the region itself would put it.
 *
 * WR-A10: a group mark in any other position is rejected as
 * 'ambiguous-separator', never silently dropped. '12,50' in en-US or '12.5'
 * in de-DE almost always means the user typed the other convention's decimal
 * mark (a European user on an en-US device, a figure pasted from elsewhere);
 * dropping the mark would store 100x or 10x the intended amount. Refusing is
 * the only safe answer -- the parser never guesses which convention was meant.
 * Well-placed grouping ('1,234.56', en-IN '12,34,567.5') is still accepted.
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

/**
 * WR-A10: how many digits a locale puts in each group, read from the same
 * formatToParts probe as the separators: `primary` is the size of the group
 * next to the decimal mark (3 almost everywhere), `secondary` the size of
 * every group further left (3, or 2 for the Indian lakh/crore system).
 */
export interface LocaleGrouping {
  primary: number;
  secondary: number;
}

const DEFAULT_GROUPING: LocaleGrouping = { primary: 3, secondary: 3 };

export function localeGrouping(locale: string): LocaleGrouping {
  const integers = new Intl.NumberFormat(locale)
    .formatToParts(1234567.5)
    .filter((p) => p.type === 'integer')
    .map((p) => p.value.length);
  // No grouping at all in this locale's rendering: fall back to the common 3/3.
  if (integers.length < 2) return DEFAULT_GROUPING;
  const primary = integers[integers.length - 1] as number;
  const secondary = integers.length >= 3 ? (integers[integers.length - 2] as number) : primary;
  return { primary, secondary };
}

/**
 * WR-A10: true when the whole-part digit groups (split at every group mark)
 * sit where `grouping` puts them. Every group must be non-empty, the last one
 * exactly `primary` long, every middle one exactly `secondary` long, and the
 * leading one 1..`secondary` digits.
 */
function isWellGrouped(groups: readonly string[], grouping: LocaleGrouping): boolean {
  const last = groups.length - 1;
  return groups.every((g, i) => {
    if (i === last) return g.length === grouping.primary;
    if (i === 0) return g.length >= 1 && g.length <= grouping.secondary;
    return g.length === grouping.secondary;
  });
}

export type ParseError = 'empty' | 'invalid' | 'ambiguous-separator' | 'too-many-decimals' | 'too-large';

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
  opts: { locale: string; maxFractionDigits: number; separators?: LocaleSeparators }
): ParseDecimalResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  // WR-A11: the device's own region separators, when the caller has them, win
  // over the ones derived from the locale tag -- the tag is the preferred
  // *language* and can disagree with the region (language English, region
  // Germany), and the native decimal keypad types the region's mark.
  const { decimal, group } = opts.separators ?? localeSeparators(opts.locale);
  const groupChars = buildGroupCharSet(group);

  let whole = '';
  let fraction = '';
  let inFraction = false;
  let seenDecimal = false;
  // WR-A10: the whole part's digit groups, split at each group mark, so their
  // placement can be checked once the whole part is complete.
  const groups: string[] = [''];

  for (const ch of trimmed) {
    const digit = normalizeDigit(ch);
    if (digit !== undefined) {
      if (inFraction) {
        fraction += digit;
      } else {
        whole += digit;
        groups[groups.length - 1] += digit;
      }
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
      groups.push('');
      continue;
    }

    // Anything else -- letters, signs (including the true minus U+2212),
    // a stray decimal mark from a different locale -- is not part of a
    // strict amount.
    return { ok: false, error: 'invalid' };
  }

  // Covers '.', a group-mark-only string, and any input with no digits.
  if (whole === '' && fraction === '') return { ok: false, error: 'invalid' };

  if (groups.length > 1 && !isWellGrouped(groups, localeGrouping(opts.locale))) {
    return { ok: false, error: 'ambiguous-separator' };
  }

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
 * so that case throws rather than returning a result. `separators` (WR-A11)
 * are the device region's own marks; pass them whenever they are known.
 */
export function parseAmount(
  raw: string,
  opts: { locale: string; exponent: number; separators?: LocaleSeparators }
): ParseAmountResult {
  const { locale, exponent, separators } = opts;
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
    throw new RangeError(`parseAmount: exponent ${exponent} must be an integer between 0 and 4`);
  }

  const parsed = parseDecimalString(raw, { locale, maxFractionDigits: exponent, separators });
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
