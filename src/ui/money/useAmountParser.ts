/**
 * MON-02/D-24/WR-A10/WR-A11/RD-02: the one place any amount-entry field parses a
 * free-typed figure. Phase 2's Record sheet (and every later amount-entry field) calls
 * this hook rather than `parseAmount` directly, so the resolved region's separators and
 * the error copy for every `parseAmount` error code -- including `'ambiguous-separator'`
 * (WR-A10, flagged by the Phase 1 review as needing its own UI copy rather than folding
 * into a generic "invalid amount" message) -- are wired exactly once.
 *
 * RD-02's region precedence (in-app override > device region > time zone tiebreak) is
 * not re-derived here -- that logic lives once, in `useDeviceLocale`
 * (src/services/locale/deviceLocale.ts), and this hook only consumes its resolved
 * `locale`/`separators` output.
 */
import { useCallback, useMemo } from 'react';
import {
  currencyCode as toCurrencyCode,
  formatAmount,
  localeGrouping,
  localeSeparators,
  minorUnits,
  parseAmount,
  resolveExponent,
  toDecimalString,
  type ParseAmountResult,
} from '@/engine/money';
import { assertNever } from '@/engine/guards/assertNever';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useT } from '@/i18n';

export type AmountParseFailure = Extract<ParseAmountResult, { ok: false }>;

export interface AmountParser {
  /**
   * Parses `input` for `currencyCode`, using the resolved region's own separators
   * (RD-02, WR-A11) and that currency's ISO 4217 minor-unit exponent (MON-13).
   * `customDecimals` overrides the exponent for a custom currency (D-07).
   */
  parse(input: string, currencyCode: string, customDecimals?: number): ParseAmountResult;
  /** Catalogue copy for a failed parse, covering every `ParseError` code (WR-A10/WR-A11). */
  errorMessage(result: AmountParseFailure): string;
  /**
   * S-CR-01: the unsigned magnitude of `minor` as editable field text, written with the
   * resolved region's own decimal mark and the currency's own exponent, with no grouping --
   * so `parse(toInputText(m, c), c)` round-trips to `|m|` by construction in every region
   * (de-DE '12,50', KWD '500,000'). String maths only (toDecimalString), never a float.
   */
  toInputText(minor: number, currencyCode: string, customDecimals?: number): string;
  /**
   * 06.1-52 (X-4): the field's resting text once it loses focus: the region's grouping marks, and no fraction on a whole
   * amount ('9,000', '9,000.50'). Pure string maths with the same marks `parse` reads, so it parses back to `|minor|`.
   */
  toDisplayText(minor: number, currencyCode: string, customDecimals?: number): string;
}

/**
 * 06.1-52 (C-10, T-06.1-52-01): the markers a person may type for the field's own currency -- the symbol the app shows
 * (formatAmount: "$" is USD only, other dollars keep CA$ / A$), the locale's own symbol, and the ISO code. Another
 * currency's symbol is never in the set, so '£150' in a USD field still fails.
 */
function currencyMarkers(locale: string, code: string): string[] {
  const markers = new Set<string>([code.toUpperCase()]);
  try {
    const shown = formatAmount({ amount: minorUnits(0), currency: toCurrencyCode(code) }, { locale, showCents: false });
    const symbol = shown.replace(/[^\p{L}\p{S}]/gu, '');
    if (symbol !== '') markers.add(symbol);
    const own = new Intl.NumberFormat(locale, { style: 'currency', currency: code })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value;
    if (own !== undefined && (own !== '$' || code.toUpperCase() === 'USD')) markers.add(own);
  } catch {
    // A custom code Intl cannot read keeps only the code itself.
  }
  return [...markers].sort((a, b) => b.length - a.length);
}

/** Drops one leading or one trailing marker of the field's own currency (and the space beside it). */
function stripCurrencyMarker(input: string, markers: readonly string[]): string {
  const trimmed = input.trim();
  for (const marker of markers) {
    if (trimmed.startsWith(marker)) return trimmed.slice(marker.length).trim();
    if (trimmed.endsWith(marker)) return trimmed.slice(0, trimmed.length - marker.length).trim();
  }
  return input;
}

/** Groups a run of ASCII digits the way the region does (3/3, or the lakh 3/2). */
function groupDigits(whole: string, primary: number, secondary: number, mark: string): string {
  if (whole.length <= primary) return whole;
  const groups = [whole.slice(whole.length - primary)];
  let rest = whole.slice(0, whole.length - primary);
  while (rest.length > secondary) {
    groups.unshift(rest.slice(rest.length - secondary));
    rest = rest.slice(0, rest.length - secondary);
  }
  groups.unshift(rest);
  return groups.join(mark);
}

/**
 * A fixed probe amount, formatted with the resolved locale's own marks, so the
 * ambiguous-separator message can show the user's own region what a correctly grouped
 * amount looks like -- without this hook (or the copy) hardcoding '.'/',' (D-24).
 */
function groupingExample(locale: string): string {
  return new Intl.NumberFormat(locale).format(1234.5);
}

/** 06.1-52: '1,200.50' in the region's own marks (up to the currency's decimals), for the digits-only message. */
function digitsExample(locale: string, separators: { decimal: string; group: string } | null | undefined, maxDecimals: number): string {
  const { decimal, group } = separators ?? localeSeparators(locale);
  const fraction = '50'.slice(0, Math.min(maxDecimals, 2));
  return fraction === '' ? `1${group}200` : `1${group}200${decimal}${fraction}`;
}

export function useAmountParser(regionOverride?: string | null): AmountParser {
  const { locale, separators } = useDeviceLocale(regionOverride);
  const t = useT();

  const parse = useCallback(
    (input: string, currencyCode: string, customDecimals?: number) =>
      parseAmount(stripCurrencyMarker(input, currencyMarkers(locale, currencyCode)), {
        locale,
        exponent: resolveExponent(currencyCode, customDecimals),
        separators,
      }),
    [locale, separators]
  );

  const errorMessage = useCallback(
    (result: AmountParseFailure): string => {
      switch (result.error) {
        case 'empty':
          return t('money.amountInput.error.empty');
        case 'invalid':
          // 06.1-52 (C-10): say what the field reads, with the region's own marks.
          return t('money.amountInput.error.digitsOnly', { example: digitsExample(locale, separators, result.maxDecimals) });
        case 'ambiguous-separator':
          return t('money.amountInput.error.ambiguousSeparator', { example: groupingExample(locale) });
        case 'too-many-decimals':
          return t('money.amountInput.error.tooManyDecimals', { count: result.maxDecimals });
        case 'too-large':
          return t('money.amountInput.error.tooLarge');
        default:
          return assertNever(result.error, 'ParseError');
      }
    },
    [t, locale, separators]
  );

  const toInputText = useCallback(
    (minor: number, currencyCode: string, customDecimals?: number): string => {
      // The same separator choice parseAmount makes: the region's own pair, else the tag's.
      const { decimal } = separators ?? localeSeparators(locale);
      const plain = toDecimalString(minorUnits(Math.abs(minor)), resolveExponent(currencyCode, customDecimals));
      return decimal === '.' ? plain : plain.replace('.', decimal);
    },
    [locale, separators]
  );

  const toDisplayText = useCallback(
    (minor: number, currencyCode: string, customDecimals?: number): string => {
      const { decimal, group } = separators ?? localeSeparators(locale);
      const { primary, secondary } = localeGrouping(locale);
      const exponent = resolveExponent(currencyCode, customDecimals);
      const plain = toDecimalString(minorUnits(Math.abs(minor)), exponent);
      const [whole = '0', fraction = ''] = plain.split('.');
      const grouped = groupDigits(whole, primary, secondary, group);
      return /^0*$/.test(fraction) ? grouped : `${grouped}${decimal}${fraction}`;
    },
    [locale, separators]
  );

  return useMemo(
    () => ({ parse, errorMessage, toInputText, toDisplayText }),
    [parse, errorMessage, toInputText, toDisplayText]
  );
}
