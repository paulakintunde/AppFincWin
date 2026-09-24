/**
 * ISO 4217 minor-unit exception table (MON-13). Every currency not listed
 * here defaults to 2 decimal places; a handful of currencies use 0, 3 or 4.
 * Assuming 2 decimals for an unlisted exception corrupts amounts by 10x or
 * 100x, so this table -- not a hardcoded 2 -- is the single source of truth
 * for how many minor units make one major unit of a currency.
 *
 * Cross-checked against the `currency-codes` npm package's ISO 4217 data
 * during implementation (scratch-only, not a runtime dependency -- see
 * plan 01-01 Task 2 and the SUMMARY for the comparison result).
 */
export const ISO_EXPONENT_EXCEPTIONS: Readonly<Record<string, number>> = Object.freeze({
  // Zero decimal places
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Three decimal places
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Four decimal places
  CLF: 4,
  UYW: 4,
});

export function currencyExponent(code: string): number {
  return ISO_EXPONENT_EXCEPTIONS[code] ?? 2;
}

export function resolveExponent(code: string, customDecimals?: number): number {
  if (customDecimals !== undefined) {
    if (!Number.isInteger(customDecimals) || customDecimals < 0 || customDecimals > 4) {
      throw new RangeError(
        `resolveExponent: customDecimals ${customDecimals} must be an integer between 0 and 4`
      );
    }
    return customDecimals;
  }
  return currencyExponent(code);
}
