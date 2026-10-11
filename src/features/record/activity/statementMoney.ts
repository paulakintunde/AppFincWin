// Review ME-01: a statement figure (stmt_orig_*) is display-only provenance written by an import, so
// the screen must never crash on it. A code the app knows is formatted normally; anything else (a
// malformed or unexpected stored code) reads as the code followed by a plain number, and is never
// handed to Intl.NumberFormat's currency style, which throws RangeError for codes it rejects.
import { currencyExponent, knownCurrencyExponent, minorUnits, money, toDecimalString } from '@/engine/money';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export function formatStatementMoney(formatter: Pick<MoneyFormatter, 'formatMoney'>, magnitude: number, code: string): string {
  const exponent = knownCurrencyExponent(code);
  if (exponent !== null) {
    try {
      return formatter.formatMoney(money(magnitude, code));
    } catch {
      // fall through to the plain form
    }
  }
  return `${code} ${toDecimalString(minorUnits(magnitude), exponent ?? currencyExponent(code))}`;
}
