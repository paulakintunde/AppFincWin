/**
 * D-06, D-07, D-26 (05.1). Currency amounts are allowed here. The table is FIXED: it is computed once from
 * REFERENCE_USD_RATES with the tidy rule and reviewed with app updates; it never follows live rates, so a purchase never
 * changes band overnight. Only a currency missing from the table uses today's rate (the snapshot passes it; the engine
 * never fetches FX).
 *
 * Tidy rule: the US$ edge is converted exactly (rational arithmetic, no floats) to the home currency, then rounded
 * half-up to 1 significant figure in major units (US$50 at 150 yen = 7,500 yen, tidied to 8,000 yen). A value under 1 major
 * unit is rounded to 1 significant figure in minor units instead.
 *
 * Collapse rule: every edge is clamped at MAX_ABS_AMOUNT_MINOR (the database cap). With an extreme rate the top edges can
 * all clamp to the cap and so collapse into one; edges stay non-decreasing, and because the band rule counts edges
 * strictly below the whole, and no whole exceeds the cap, a whole is never put above the band of the first clamped edge.
 */
import { currencyExponent } from '../../money/currencyExponents';
import { divideHalfUp } from '../../money/rounding';
import { MAX_ABS_AMOUNT_MINOR, minorUnits, type MinorUnits } from '../../money/types';
import { BAND_EDGES_USD, QUOTED_TOLERANCE_USD, UNSPENT_DRIFT_USD } from './constants';
import type { HomeThresholds } from './types';

export interface UsdRate {
  readonly num: bigint;
  readonly den: bigint;
}

// Cite: FincWin choice: reference rates fixed for the band table, as of 2026-10 (owner reviews with app updates; D-07). Home major units per US$1.
export const REFERENCE_USD_RATES: Readonly<Record<string, string>> = Object.freeze({
  USD: '1',
  EUR: '0.92',
  GBP: '0.79',
  CAD: '1.37',
  AUD: '1.52',
  NZD: '1.66',
  CHF: '0.88',
  JPY: '150',
  KRW: '1380',
  CNY: '7.2',
  INR: '84',
  NGN: '1530',
  ZAR: '18',
  KES: '129',
  GHS: '15.5',
  MXN: '19.5',
  BRL: '5.6',
  SGD: '1.33',
  HKD: '7.8',
  AED: '3.6725',
  SEK: '10.6',
  NOK: '10.9',
  DKK: '6.9',
  PLN: '4.0',
  PHP: '57',
});

/** Exact decimal string ('3.6725') to a fraction. No floats. */
function parseRate(s: string): UsdRate {
  const [whole = '0', frac = ''] = s.split('.');
  return { num: BigInt(whole + frac), den: 10n ** BigInt(frac.length) };
}

function digits(n: bigint): number {
  return n.toString().length;
}

const MAX_BIG = BigInt(MAX_ABS_AMOUNT_MINOR);

// Cite: D-06 (05.1-CONTEXT): tidy numbers, 1 significant figure, half-up, in major units. FincWin choice.
export function tidyFromUsd(usdMinor: number, rate: UsdRate, exponent: number): MinorUnits {
  // home minor value = N / D exactly
  const scale = 10n ** BigInt(exponent);
  const n = BigInt(usdMinor) * rate.num * scale;
  const d = rate.den * 100n;
  const majorFloor = n / (d * scale);
  let stepPow: number;
  if (majorFloor >= 1n) {
    stepPow = digits(majorFloor) - 1 + exponent;
  } else {
    const minorFloor = n / d;
    if (minorFloor < 1n) return minorUnits(0);
    stepPow = digits(minorFloor) - 1;
  }
  const step = 10n ** BigInt(stepPow);
  const tidy = divideHalfUp(n, d * step) * step;
  return minorUnits(Number(tidy > MAX_BIG ? MAX_BIG : tidy));
}

interface Entry {
  readonly edges: readonly MinorUnits[];
  readonly unspentDrift: MinorUnits;
  readonly quotedTolerance: MinorUnits;
}

function build(currency: string, rate: UsdRate): Entry {
  const exp = currencyExponent(currency);
  return {
    edges: BAND_EDGES_USD.map((e) => tidyFromUsd(e, rate, exp)),
    unspentDrift: tidyFromUsd(UNSPENT_DRIFT_USD, rate, exp),
    quotedTolerance: tidyFromUsd(QUOTED_TOLERANCE_USD, rate, exp),
  };
}

// Cite: D-07 (05.1-CONTEXT): the fixed per-currency table of band edges, drift threshold and quoted tolerance. USD is the identity. FincWin choice.
export const BAND_TABLE: Readonly<Record<string, Entry>> = (() => {
  const out: Record<string, Entry> = {};
  for (const [code, rate] of Object.entries(REFERENCE_USD_RATES)) {
    out[code] =
      code === 'USD'
        ? {
            edges: BAND_EDGES_USD.map((e) => minorUnits(e)),
            unspentDrift: minorUnits(UNSPENT_DRIFT_USD),
            quotedTolerance: minorUnits(QUOTED_TOLERANCE_USD),
          }
        : build(code, parseRate(rate));
  }
  return Object.freeze(out);
})();

// Cite: D-07, D-26, I29 (05.1-CONTEXT): table hit, else today's rate with the same tidy rule, else cautious empty thresholds. FincWin choice.
export function homeThresholds(currency: string, usdRate: UsdRate | null): HomeThresholds {
  const hit = BAND_TABLE[currency];
  if (hit !== undefined) {
    return { bandEdges: hit.edges, unspentDrift: hit.unspentDrift, quotedTolerance: hit.quotedTolerance, source: 'table' };
  }
  if (usdRate !== null && usdRate.num > 0n && usdRate.den > 0n) {
    const e = build(currency, usdRate);
    return { bandEdges: e.edges, unspentDrift: e.unspentDrift, quotedTolerance: e.quotedTolerance, source: 'fallback' };
  }
  return { bandEdges: [], unspentDrift: minorUnits(0), quotedTolerance: minorUnits(0), source: 'missing' };
}
