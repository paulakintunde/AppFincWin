/**
 * 05.4 FIN-27 / ARC-25 (D-18..D-20): the one owner of region tax defaults. Nothing else reads TAX_DEFAULTS.
 * - US and Canada with a state or province set: the usual combined rate, an estimate the user can change ('add').
 * - UK and the 27 EU member states: shop prices already include VAT, so nothing is added ('included'); no rate is stored.
 * - Anything else, including the US or Canada with no state or province set: 'unknown'. No rate is guessed (D-20).
 * Region precedence (the user's own setting, then the device region, then the time zone; never IP) is the caller's.
 */
import type { Percent } from '../../../payoff/types';
import { TAX_DEFAULTS, type TaxBasis } from './defaults';

export type TaxDefaultLookup =
  | { readonly kind: 'add'; readonly percent: Percent; readonly basis: TaxBasis; readonly asOf: string; readonly source: string }
  | { readonly kind: 'included' }
  | { readonly kind: 'unknown' };

/** GB and the 27 EU member states (ISO 3166-1 alpha-2). */
export const INCLUDED_COUNTRIES: readonly string[] = Object.freeze([
  'GB',
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** Countries whose tax depends on the state or province (no country-wide rate). */
const BY_SUBDIVISION: readonly string[] = ['US', 'CA'];

export function lookupTaxDefault(region: { readonly country: string | null; readonly subdivision: string | null }): TaxDefaultLookup {
  const { country, subdivision } = region;
  if (country === null) return { kind: 'unknown' };
  if (INCLUDED_COUNTRIES.includes(country)) return { kind: 'included' };
  if (!BY_SUBDIVISION.includes(country) || subdivision === null) return { kind: 'unknown' };
  const row = TAX_DEFAULTS[`${country}-${subdivision}`];
  if (row === undefined) return { kind: 'unknown' };
  return { kind: 'add', percent: row.percent, basis: row.basis, asOf: row.asOf, source: row.source };
}
