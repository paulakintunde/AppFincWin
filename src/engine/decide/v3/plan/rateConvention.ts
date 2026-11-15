/**
 * 06.1 FIN-23 (owner D-26, 2026-11-12, AP-01..AP-06): how a typed APR becomes the rate for one payment period.
 * - UK and EU lenders quote an APR that already holds the compounding (a yearly effective rate: CONC App 1.2 in the UK, the
 *   Consumer Credit Directive in the EU). With the region set to the UK or an EU country, the period rate r is the one with
 *   (1 + r)^(payments a year) = 1 + APR, so the payment matches the lender's quote (Tesco Bank 6.6% over 60 months: £195.23;
 *   Consorsbank 9.09% over 36 months: €316.75; the engine rounds a payment up, so it shows 1p or 1 cent more, owner-approved).
 * - Anywhere else, and with no region set (pounds or euros included, owner), the APR is read as today: APR / payments a year.
 * The result is on the scale scaledApr uses (the period rate is result / rateDenominator(amortBase(cadence))), so payoff/ and
 * exactInterestBp stay unchanged. Integer maths only: the largest scaled rate whose compounding does not pass 1 + APR.
 */
import { ONE_HUNDRED_PERCENT, rateDenominator, type Percent } from '../../../payoff/types';
import type { Cadence } from '../types';
import { amortBase, scaledApr } from './cadence';

/** The UK and the 27 EU member states (ISO 3166-1 alpha-2). Its own list: the tax list answers a different question. */
export const EFFECTIVE_APR_COUNTRIES: readonly string[] = Object.freeze([
  'GB',
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** 'uk' or 'eu' when a typed APR is read as lenders there quote it; null when it is read as today. */
export function effectiveAprArea(country: string | null): 'uk' | 'eu' | null {
  if (country === null || !EFFECTIVE_APR_COUNTRIES.includes(country)) return null;
  return country === 'GB' ? 'uk' : 'eu';
}

/**
 * The scaled rate for one payment period of `cadence` (as scaledApr returns it). For the UK and the EU: the largest x with
 * (D + x)^base x H^every <= D^base x (H + apr)^every, where D = rateDenominator(base) and H = 100%, so (1 + x / D)^(base / every)
 * never passes 1 + APR. 0% stays 0.
 */
export function periodicRateFor(apr: Percent, cadence: Cadence, country: string | null): Percent {
  const nominal = scaledApr(apr, cadence);
  if (apr === 0n || effectiveAprArea(country) === null) return nominal;
  const base = amortBase(cadence);
  const D = rateDenominator(base);
  const B = BigInt(base);
  const E = BigInt(cadence.every);
  const limit = D ** B * (ONE_HUNDRED_PERCENT + apr) ** E;
  const scale = ONE_HUNDRED_PERCENT ** E;
  // The nominal rate always compounds past 1 + APR, so it bounds the search from above.
  let lo = 0n;
  let hi: bigint = nominal;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if ((D + mid) ** B * scale <= limit) lo = mid;
    else hi = mid - 1n;
  }
  return lo as Percent;
}
