// Review HI-01: the statement import's one currency lookup. A code read off a statement (a PDF
// note, OFX CURDEF/CURSYM, a CSV currency or original-currency cell) is a currency only when the
// app explicitly knows it: the built-in ISO list, the user's own custom currencies, or the
// currency of one of the household's accounts. Anything else ("REF", "TEL", "ATM") is null, so
// the engine treats it as text and Phase 2's unknown-currency row issue applies again.
import { currencyExponent, knownCurrencyExponent, type KnownCustomCurrency } from '@/engine/money';

export type ExponentLookup = (code: string) => number | null;

export function importExponentLookup(
  customs: readonly KnownCustomCurrency[],
  accountCurrencies: readonly string[]
): ExponentLookup {
  const accounts = new Set(accountCurrencies);
  return (code: string): number | null => {
    const known = knownCurrencyExponent(code, customs);
    if (known !== null) return known;
    // A household member's custom-currency account: its code is known even when the custom
    // currency row belongs to someone else (custom currencies are owner-scoped). Its scale
    // falls back to the same rule the rest of the app uses for that account.
    return accounts.has(code) ? currencyExponent(code) : null;
  };
}
