// 05-33 (D-37): read-side conversion at the latest STORED rate. Pure; no I/O; never imports the FX fetch door (depcruise fx-fetch-never-from-reads). Moved from provisional.ts so Decide and Activity share one custom-aware resolver.
import {
  convertMinorExact,
  crossRate,
  customPerEur,
  EUR_PER_EUR,
  formatRate,
  minorUnits,
  parseRate,
  resolveExponent,
  type ConversionLeg,
  type CustomLegRate,
  type ScaledRate,
} from '@/engine/money';
import type { CustomCurrencyRow, FxLatestRow, RateSource } from '@/db/rows';

export interface PerEurResult {
  readonly rate: ScaledRate;
  /**
   * IN-A01: EUR's own leg is dated the transaction's local_date, as per_eur_rate() does
   * server-side (`rate_date := p_on`); '' when no local date was given, which never wins.
   */
  readonly rateDate: string;
  readonly source: RateSource | null;
  /**
   * RD-03: the raw custom-currency stamp behind `rate` (the reference currency's own per-EUR
   * rate plus this custom currency's declared unit_value), present only when this leg resolved
   * through a custom currency. `rate` itself stays the rounded customPerEur value used for
   * display (orig_per_eur/home_per_eur/rate); convertMinorExact substitutes this raw stamp
   * instead so home_amount never rounds twice, mirroring per_eur_rate()'s
   * custom_unit_value/custom_ref_per_eur out params.
   */
  readonly custom?: CustomLegRate;
}

export function findCustom(code: string, customs: readonly CustomCurrencyRow[]): CustomCurrencyRow | undefined {
  return customs.find((c) => c.code === code);
}

function findCachedRate(code: string, rates: readonly FxLatestRow[]): FxLatestRow | undefined {
  return rates.find((r) => r.quote === code);
}

/** The lesser (earlier) of two rate dates; an empty string (EUR's own leg) never wins. */
export function earlierDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Resolves "units of `code` per 1 EUR", recursing through a custom currency's declared
 * reference currency the same way per_eur_rate() does server-side (D-07). Returns null when
 * no cached rate covers `code` at all -- the caller falls back to the fully-pending stamp.
 */
export function resolvePerEur(
  code: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  onDate: string,
  seen: ReadonlySet<string> = new Set()
): PerEurResult | null {
  if (code === 'EUR') {
    return { rate: EUR_PER_EUR, rateDate: onDate, source: null };
  }
  if (seen.has(code)) return null; // guards a malformed reference cycle

  const custom = findCustom(code, customs);
  if (custom) {
    const ref = resolvePerEur(custom.reference_currency, rates, customs, onDate, new Set([...seen, code]));
    if (!ref) return null;
    const unitValue = parseRate(custom.unit_value);
    // IN-A02: a very large unit value rounds the per-EUR rate to 0 at 10 dp (customPerEur
    // throws). A zero rate breaks the ScaledRate invariant -- as the target leg it would
    // silently convert to 0 -- so it counts as "no usable rate" (null), never a throw.
    let rate: ScaledRate;
    try {
      rate = customPerEur(ref.rate, unitValue);
    } catch {
      return null;
    }
    return {
      rate,
      rateDate: earlierDate(ref.rateDate, custom.as_of),
      source: 'custom',
      // RD-03: ref.rate is the reference currency's own per-EUR rate as resolved for this
      // call -- itself never a custom leg (WR-B06: a custom currency's reference must be
      // ISO) -- so it carries no further rounding of its own beyond customPerEur's 10dp
      // quantisation above, which this raw stamp avoids passing on to convertMinorExact.
      custom: { unitValue, referencePerEur: ref.rate },
    };
  }

  const cached = findCachedRate(code, rates);
  if (!cached) return null;
  return { rate: parseRate(cached.rate), rateDate: cached.rate_date, source: cached.source };
}

export interface LatestConversion {
  readonly amount: number;
  readonly fromPerEur: ScaledRate;
  readonly toPerEur: ScaledRate;
  readonly rateDate: string;
}

/**
 * Converts `amount` (minor units of `from`) into `home` at the latest stored rates. Null on any
 * missing rate, unusable exponent or overflow: Decide reports the check as missing rather than
 * scoring a guessed figure (D-37). Never throws.
 */
export function convertLatest(
  amount: number,
  from: string,
  home: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  today: string
): LatestConversion | null {
  if (from === home) {
    return { amount, fromPerEur: EUR_PER_EUR, toPerEur: EUR_PER_EUR, rateDate: today };
  }
  try {
    const orig = resolvePerEur(from, rates, customs, today);
    const dest = resolvePerEur(home, rates, customs, today);
    if (!orig || !dest) return null;
    const origLeg: ConversionLeg = { perEur: orig.rate, custom: orig.custom };
    const destLeg: ConversionLeg = { perEur: dest.rate, custom: dest.custom };
    const converted = convertMinorExact(
      minorUnits(amount),
      origLeg,
      resolveExponent(from, findCustom(from, customs)?.decimals),
      destLeg,
      resolveExponent(home, findCustom(home, customs)?.decimals)
    );
    return {
      amount: converted,
      fromPerEur: orig.rate,
      toPerEur: dest.rate,
      rateDate: earlierDate(orig.rateDate, dest.rateDate),
    };
  } catch {
    return null;
  }
}

/** Home units per 1 unit of the foreign currency, as the engine's 10-dp string. */
export function basisRateText(fromPerEur: ScaledRate, toPerEur: ScaledRate): string {
  return formatRate(crossRate(fromPerEur, toPerEur));
}

/**
 * A stored 10-dp rate string rounded for reading: 2 decimals at or above 1, else 4. Half-up on
 * the decimal digits, carrying into the integer part. String/bigint digit maths only.
 */
export function displayRate(rateText: string): string {
  const point = rateText.indexOf('.');
  const whole = point < 0 ? rateText : rateText.slice(0, point);
  const frac = point < 0 ? '' : rateText.slice(point + 1);
  const decimals = BigInt(whole) >= 1n ? 2 : 4;
  const padded = frac.padEnd(decimals + 1, '0');
  let scaled = BigInt(whole + padded.slice(0, decimals));
  if (padded.charAt(decimals) >= '5') scaled += 1n;
  const digits = scaled.toString().padStart(decimals + 1, '0');
  return `${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals)}`;
}
