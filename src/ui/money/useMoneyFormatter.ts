/**
 * Binds engine/money's pure formatAmount/formatLocalDate to the device locale (DSG-06,
 * D-22, D-25). The caller passes Show cents explicitly -- this hook never reads the
 * profile row or any other preference itself, and has no dependency on plan 01-13's
 * useMoneyPrefs. `engine/` stays free of React and device I/O; this hook is the one place
 * the device's own locale enters a formatted string.
 */
import { useCallback, useMemo } from 'react';
import { formatAmount, formatLocalDate, formatMoneyA11y as formatMoneyA11yPure, type LocalDateStyle, type Money } from '@/engine/money';
import { useDeviceLocale } from '@/services/locale/deviceLocale';

export interface MoneyFormatterOptions {
  /** Overrides the ISO 4217 lookup -- required for a custom currency (MON-13). */
  exponent?: number;
  /** Set for a custom currency (D-07), whose code Intl does not recognize. */
  customSymbol?: string;
  /** D-94: a custom currency's own name, read aloud instead of its symbol. */
  customName?: string;
}

export interface MoneyFormatter {
  formatMoney(money: Money, opts?: MoneyFormatterOptions): string;
  /** D-94: the amount as a screen reader should speak it ("1,500 Canadian dollars"). */
  formatMoneyA11y(money: Money, opts?: MoneyFormatterOptions): string;
  formatDate(localDate: string, style?: LocalDateStyle): string;
  locale: string;
}

/**
 * `homeCurrency` (D-94) decides how USD is spoken: "dollars" at a USD home, "US dollars"
 * otherwise. Omit it and USD always reads "US dollars", which is never ambiguous.
 */
/** 06.1-72 (G-73-2): the most strings one formatter keeps before it starts over. */
export const FORMAT_MEMO_MAX = 400;

/**
 * 06.1-72 (G-73-2): the engine's formatters build a new Intl.NumberFormat or DateTimeFormat on every call, and a screen
 * re-render formats the same amounts and dates again. One formatter keeps the strings it already made (same locale, show-cents
 * and currency settings, so the same output), so a re-render with unchanged figures builds no Intl objects.
 */
function memoOf(): (key: string, make: () => string) => string {
  const memo = new Map<string, string>();
  return (key, make) => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const value = make();
    if (memo.size >= FORMAT_MEMO_MAX) memo.clear();
    memo.set(key, value);
    return value;
  };
}

const optsKey = (money: Money, opts?: MoneyFormatterOptions): string =>
  `${money.currency}|${String(money.amount)}|${opts?.exponent ?? ''}|${opts?.customSymbol ?? ''}|${opts?.customName ?? ''}`;

export function useMoneyFormatter(showCents: boolean, homeCurrency?: string): MoneyFormatter {
  const { locale } = useDeviceLocale();
  const memo = useMemo(() => memoOf(), [locale, showCents, homeCurrency]);

  const formatMoney = useCallback(
    (money: Money, opts?: MoneyFormatterOptions) =>
      memo(`m|${optsKey(money, opts)}`, () =>
        formatAmount(money, {
          locale,
          showCents,
          exponent: opts?.exponent,
          customSymbol: opts?.customSymbol,
        })
      ),
    [memo, locale, showCents]
  );

  const formatMoneyA11y = useCallback(
    (money: Money, opts?: MoneyFormatterOptions) =>
      memo(`a|${optsKey(money, opts)}`, () =>
        formatMoneyA11yPure(money, {
          locale,
          showCents,
          exponent: opts?.exponent,
          customSymbol: opts?.customSymbol,
          customName: opts?.customName,
          homeCurrency,
        })
      ),
    [memo, locale, showCents, homeCurrency]
  );

  const formatDate = useCallback(
    (localDate: string, style?: LocalDateStyle) => memo(`d|${localDate}|${style ?? ''}`, () => formatLocalDate(localDate, locale, style)),
    [memo, locale]
  );

  return useMemo(
    () => ({ formatMoney, formatMoneyA11y, formatDate, locale }),
    [formatMoney, formatMoneyA11y, formatDate, locale]
  );
}
