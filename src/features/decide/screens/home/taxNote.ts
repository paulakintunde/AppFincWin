/**
 * 06.1-21 (D01): the note at the right of the price on Decide home. Pure. A region whose prices include tax says nothing; a region the
 * engine knows a rate for says the estimate; no region says tax is not included (decide.v3.notice.tax_not_included). The estimate is
 * never stored: the stepper and the engine work the real figure out.
 */
import type { Percent } from '@/engine/decide';
import { INCLUDED_COUNTRIES, lookupTaxDefault, salesTaxOf } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';

export type TaxNote =
  | { readonly kind: 'estimate'; readonly amount: number; readonly percent: string }
  | { readonly kind: 'unknown' }
  | null;

/** A scaled Percent (10 decimal places) as text: 7.5, 22.9, 0. */
export function percentTextOf(p: Percent): string {
  const padded = p.toString().padStart(11, '0');
  const whole = padded.slice(0, padded.length - 10);
  const frac = padded.slice(padded.length - 10).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

export function taxNoteFor(input: { price: number | null; country: string | null; subdivision: string | null }): TaxNote {
  if (input.country !== null && INCLUDED_COUNTRIES.includes(input.country)) return null;
  const lookup = lookupTaxDefault({ country: input.country, subdivision: input.subdivision });
  if (lookup.kind === 'unknown') return { kind: 'unknown' };
  if (lookup.kind !== 'add' || input.price === null || input.price <= 0) return null;
  return { kind: 'estimate', amount: Number(salesTaxOf(minorUnits(input.price), lookup.percent)), percent: percentTextOf(lookup.percent) };
}
