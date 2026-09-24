/**
 * Branded money types. Every amount in the app is an integer minor unit
 * (e.g. cents), never a float (MON-01) -- constructing one from a
 * non-integer or unsafe-integer number throws immediately, so float drift
 * can never enter later arithmetic.
 *
 * CurrencyCode admits 2-4 upper-case alphanumeric characters, not just
 * ISO 4217's 3 letters, because custom currencies (D-07) may declare codes
 * like 'GLD1'.
 */
export type MinorUnits = number & { readonly __brand: 'MinorUnits' };
export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' };

export interface Money {
  readonly amount: MinorUnits;
  readonly currency: CurrencyCode;
}

// Mirrors the DB check `abs(original_amount) <= 10000000000000` (plan 01-02).
export const MAX_ABS_AMOUNT_MINOR = 10_000_000_000_000;

export function minorUnits(n: number): MinorUnits {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`minorUnits: ${n} is not a safe integer`);
  }
  return n as MinorUnits;
}

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,4}$/;

export function currencyCode(s: string): CurrencyCode {
  if (!CURRENCY_CODE_PATTERN.test(s)) {
    throw new RangeError(`currencyCode: "${s}" is not a valid currency code`);
  }
  return s as CurrencyCode;
}

export function money(amount: number, currency: string): Money {
  return { amount: minorUnits(amount), currency: currencyCode(currency) };
}
