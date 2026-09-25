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
import { parseAmount, resolveExponent, type ParseAmountResult } from '@/engine/money';
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
}

/**
 * A fixed probe amount, formatted with the resolved locale's own marks, so the
 * ambiguous-separator message can show the user's own region what a correctly grouped
 * amount looks like -- without this hook (or the copy) hardcoding '.'/',' (D-24).
 */
function groupingExample(locale: string): string {
  return new Intl.NumberFormat(locale).format(1234.5);
}

export function useAmountParser(regionOverride?: string | null): AmountParser {
  const { locale, separators } = useDeviceLocale(regionOverride);
  const t = useT();

  const parse = useCallback(
    (input: string, currencyCode: string, customDecimals?: number) =>
      parseAmount(input, {
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
          return t('money.amountInput.error.invalid');
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
    [t, locale]
  );

  return useMemo(() => ({ parse, errorMessage }), [parse, errorMessage]);
}
