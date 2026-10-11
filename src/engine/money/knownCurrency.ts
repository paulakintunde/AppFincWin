/**
 * Review HI-01: "is this a currency, and what is its scale?" for text read off a statement.
 *
 * `resolveExponent` / `currencyExponent` answer only the second half: every string gets an
 * exponent (2 unless listed as an ISO exception), so they cannot tell "REF" or "TEL" from a
 * real code. This lookup answers both. A code is known when it is in the built-in ISO list or
 * is one of the custom currencies the caller passes in explicitly; anything else is null.
 */
import { isoCurrency } from './isoCurrencies';

export interface KnownCustomCurrency {
  readonly code: string;
  readonly decimals: number;
}

/** The exponent of a known currency code (case-sensitive), or null when the code is not known. */
export function knownCurrencyExponent(code: string, customs: readonly KnownCustomCurrency[] = []): number | null {
  const iso = isoCurrency(code);
  if (iso !== undefined) return iso.exponent;
  const custom = customs.find((c) => c.code === code);
  return custom === undefined ? null : custom.decimals;
}
