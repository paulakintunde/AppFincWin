/**
 * Currency exchange rates, expressed as "units of currency X per 1 EUR"
 * (fx_rates.rate is numeric(24,10) -- fx_rates' base is EUR, D-05).
 * Represented as a scaled BigInt (RATE_SCALE = 10 decimal digits) so
 * conversion never touches a float or a float-producing string parse.
 *
 * Rates route through EUR because that is the stored base: after a
 * home-currency switch (D-05), past totals are re-derived from each row's
 * own dated rate, cross-converted through this same EUR base, rather than
 * rewriting history server-side.
 */
import { divideHalfUp } from './rounding';
import { minorUnits, type MinorUnits } from './types';

export const RATE_SCALE = 10;
export type ScaledRate = bigint & { readonly __brand: 'ScaledRate' };

const RATE_PATTERN = /^(\d{1,14})(?:\.(\d{1,10}))?$/;

export function parseRate(s: string): ScaledRate {
  const match = RATE_PATTERN.exec(s);
  if (!match) {
    throw new RangeError(`parseRate: "${s}" is not a valid rate`);
  }
  // Group 1 is mandatory in RATE_PATTERN, so it is always captured when
  // `match` is non-null; the non-null assertion documents that guarantee
  // rather than adding an unreachable fallback branch.
  const whole = match[1]!;
  const frac = match[2] ?? '';
  const scaled = BigInt(whole + frac.padEnd(RATE_SCALE, '0'));
  if (scaled <= 0n) {
    throw new RangeError(`parseRate: "${s}" must be greater than zero`);
  }
  return scaled as ScaledRate;
}

export const EUR_PER_EUR: ScaledRate = parseRate('1');

export function formatRate(r: ScaledRate): string {
  // ScaledRate is always positive: parseRate rejects values <= 0, and
  // crossRate/customPerEur only ever divide positive scaled rates. No
  // sign handling is needed here.
  const digits = r.toString().padStart(RATE_SCALE + 1, '0');
  const whole = digits.slice(0, digits.length - RATE_SCALE);
  const frac = digits.slice(digits.length - RATE_SCALE);
  return `${whole}.${frac}`;
}

function assertValidExponent(exponent: number, label: string): void {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
    throw new RangeError(`convertMinor: ${label} ${exponent} must be an integer between 0 and 4`);
  }
}

export function convertMinor(
  amount: MinorUnits,
  fromPerEur: ScaledRate,
  fromExponent: number,
  toPerEur: ScaledRate,
  toExponent: number
): MinorUnits {
  assertValidExponent(fromExponent, 'fromExponent');
  assertValidExponent(toExponent, 'toExponent');

  const numerator = BigInt(amount) * toPerEur * 10n ** BigInt(toExponent);
  const denominator = fromPerEur * 10n ** BigInt(fromExponent);
  const result = divideHalfUp(numerator, denominator);

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (result > maxSafe || result < -maxSafe) {
    throw new RangeError('convertMinor: result exceeds Number.MAX_SAFE_INTEGER');
  }
  return minorUnits(Number(result));
}

/** RD-03: the custom-currency stamp actually used for one leg of an exact conversion. */
export interface CustomLegRate {
  /** The custom currency's own declared unit_value (one custom unit is worth this many reference units). */
  unitValue: ScaledRate;
  /** The reference currency's own per-EUR rate actually used to resolve this leg. */
  referencePerEur: ScaledRate;
}

/** One side of convertMinorExact: a plain per-EUR rate, or a custom currency's raw stamp. */
export interface ConversionLeg {
  perEur: ScaledRate;
  custom?: CustomLegRate;
}

/**
 * RD-03: converts amount minor units exactly, with exactly one half-up rounding at the end --
 * no rounded 10dp intermediate. Fixes WR-B07's high-value drift: convertMinor (and its SQL
 * mirror) round a custom currency's per-EUR rate to 10dp (customPerEur) before converting,
 * which loses precision for a high-value unit (1 GOLD = 60,000 USD converts to 59,999.90, not
 * 60,000.00). This instead substitutes a custom leg's *raw* unit_value and reference per-EUR
 * rate directly into the single conversion ratio, so the only rounding that ever happens is
 * the one div_half_up at the very end -- mirrored exactly by SQL's convert_minor_exact().
 *
 * A plain (non-custom) leg behaves identically to convertMinor: `custom` absent on both sides
 * reduces this to exactly the same ratio convertMinor computes (verified by the shared
 * fixture, money-conversion-cases.json's `convert` cases, which every convertExact case also
 * satisfies).
 */
export function convertMinorExact(
  amount: MinorUnits,
  from: ConversionLeg,
  fromExponent: number,
  to: ConversionLeg,
  toExponent: number
): MinorUnits {
  assertValidExponent(fromExponent, 'fromExponent');
  assertValidExponent(toExponent, 'toExponent');

  // Each leg contributes exactly one per-EUR-scaled term either way (its own perEur when
  // plain, or its custom reference's raw per-EUR rate when custom), plus an extra unit_value
  // factor on the *other* side of the ratio when that leg is custom. EUR_PER_EUR (scaled
  // "1") is the correct multiplicative identity for a plain leg's missing unit_value term --
  // not an unscaled 1n -- because both the numerator and the denominator otherwise carry the
  // same RATE_SCALE factor from their per-EUR term, which only cancels when the unit_value
  // term is scaled the same way.
  const toRefPerEur = to.custom ? to.custom.referencePerEur : to.perEur;
  const fromRefPerEur = from.custom ? from.custom.referencePerEur : from.perEur;
  const fromUnitValue = from.custom ? from.custom.unitValue : EUR_PER_EUR;
  const toUnitValue = to.custom ? to.custom.unitValue : EUR_PER_EUR;

  const numerator = BigInt(amount) * toRefPerEur * 10n ** BigInt(toExponent) * fromUnitValue;
  const denominator = fromRefPerEur * 10n ** BigInt(fromExponent) * toUnitValue;
  const result = divideHalfUp(numerator, denominator);

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (result > maxSafe || result < -maxSafe) {
    throw new RangeError('convertMinorExact: result exceeds Number.MAX_SAFE_INTEGER');
  }
  return minorUnits(Number(result));
}

export function crossRate(fromPerEur: ScaledRate, toPerEur: ScaledRate): ScaledRate {
  return divideHalfUp(toPerEur * 10n ** BigInt(RATE_SCALE), fromPerEur) as ScaledRate;
}

// Largest value numeric(24,10) can hold, as a ScaledRate: 14 integer digits
// and 10 fraction digits.
const MAX_SCALED_RATE = 10n ** 24n - 1n;

/**
 * Units of a custom currency per 1 EUR: the reference currency's per-EUR
 * rate divided by how many reference units one custom unit is worth (D-07).
 * Throws RangeError when the result rounds to zero (a unit so valuable
 * that 10 decimal places cannot represent it -- every later conversion
 * would divide by zero) or exceeds numeric(24,10). This mirrors SQL
 * custom_per_eur(), which raises 22003 in both cases (WR-B07).
 */
export function customPerEur(referencePerEur: ScaledRate, unitValue: ScaledRate): ScaledRate {
  const rate = divideHalfUp(referencePerEur * 10n ** BigInt(RATE_SCALE), unitValue);
  if (rate <= 0n) {
    throw new RangeError('customPerEur: the per-EUR rate rounds to zero at 10 decimal places');
  }
  if (rate > MAX_SCALED_RATE) {
    throw new RangeError('customPerEur: the per-EUR rate exceeds numeric(24,10)');
  }
  return rate as ScaledRate;
}
