/**
 * Binds engine/money's pure formatAmount/formatLocalDate to the device locale (DSG-06,
 * D-22, D-25). The caller passes Show cents explicitly -- this hook never reads the
 * profile row or any other preference itself, and has no dependency on plan 01-13's
 * useMoneyPrefs. `engine/` stays free of React and device I/O; this hook is the one place
 * the device's own locale enters a formatted string.
 */
import { useCallback, useMemo } from 'react';
import { formatAmount, formatLocalDate, type LocalDateStyle, type Money } from '@/engine/money';
import { useDeviceLocale } from '@/services/locale/deviceLocale';

export interface MoneyFormatterOptions {
  /** Overrides the ISO 4217 lookup -- required for a custom currency (MON-13). */
  exponent?: number;
  /** Set for a custom currency (D-07), whose code Intl does not recognize. */
  customSymbol?: string;
}

export interface MoneyFormatter {
  formatMoney(money: Money, opts?: MoneyFormatterOptions): string;
  formatDate(localDate: string, style?: LocalDateStyle): string;
  locale: string;
}

export function useMoneyFormatter(showCents: boolean): MoneyFormatter {
  const { locale } = useDeviceLocale();

  const formatMoney = useCallback(
    (money: Money, opts?: MoneyFormatterOptions) =>
      formatAmount(money, {
        locale,
        showCents,
        exponent: opts?.exponent,
        customSymbol: opts?.customSymbol,
      }),
    [locale, showCents]
  );

  const formatDate = useCallback(
    (localDate: string, style?: LocalDateStyle) => formatLocalDate(localDate, locale, style),
    [locale]
  );

  return useMemo(() => ({ formatMoney, formatDate, locale }), [formatMoney, formatDate, locale]);
}
