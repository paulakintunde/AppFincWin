/**
 * 06.1-57 (A-ST-2, A-ST-4, DS-18): what is paid on the day for a check, worked out the one way the Price step shows it. Step 2's Up
 * front card and step 3's "✓ Price: $10,020" crumb both read it, so the two never disagree. The region's tax is an estimate and is
 * never stored; a typed rate wins; "Price already includes tax" adds none.
 */
import type { Percent } from '@/engine/decide';
import { INCLUDED_COUNTRIES, lookupTaxDefault, salesTaxOf, type CheckV2 } from '@/engine/decide/v3';

export interface UpFront {
  /** True when the price already includes tax (typed switch, else the country's default). */
  included: boolean;
  /** The region's usual rate when one is known and tax is added; null otherwise. */
  estimate: Percent | null;
  /** True when the region is not known, so no rate can be estimated. */
  unknownRegion: boolean;
  /** The rate used: the typed one, else the estimate; null when no tax is added. */
  effective: Percent | null;
  price: number;
  tax: number;
  fees: number;
  /** Price, tax and one-off fees. */
  cash: number;
}

export function upFrontOf(check: CheckV2, region: { country: string | null; subdivision: string | null }): UpFront {
  const { country, subdivision } = region;
  const included = check.taxIncluded ?? (country !== null && INCLUDED_COUNTRIES.includes(country));
  const lookup = lookupTaxDefault({ country, subdivision });
  const estimate = lookup.kind === 'add' ? lookup.percent : null;
  const effective: Percent | null = included ? null : (check.taxPercent ?? estimate);
  const price = check.price === null ? 0 : Number(check.price);
  const tax = check.price === null || effective === null ? 0 : Number(salesTaxOf(check.price, effective));
  const fees = Number(check.oneOffFees);
  return { included, estimate, unknownRegion: lookup.kind === 'unknown', effective, price, tax, fees, cash: price + tax + fees };
}
