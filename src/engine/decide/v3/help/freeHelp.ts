/**
 * 05.4 CMP-F04 (D-122..D-125, 05.4-38): the money-help pointers, by country. Data, not behaviour.
 * Checked by a person before launch and every 90 days (docs/ops/free-help-check.md). Websites only, https only:
 * nothing else is stored, and nothing is filled in from memory. checkedOn is the date of the last person check (null until
 * the first one). GB, US and CA only for now (D-125); a country with no checked row gets no line.
 * The answer line (fact free_help, D-123) and the About sheet's section (08.1) read this one table.
 */
import type { Fact, Result } from '../types';

export interface FreeHelpEntry {
  readonly name: string;
  readonly url: string;
  readonly checkedOn: string | null;
}

/** Keyed by ISO 3166-1 alpha-2 country (V3Inputs.region). */
export const FREE_HELP: Readonly<Record<string, FreeHelpEntry>> = Object.freeze({
  GB: Object.freeze({ name: 'MoneyHelper', url: 'https://www.moneyhelper.org.uk', checkedOn: null }),
  US: Object.freeze({ name: 'NFCC', url: 'https://www.nfcc.org', checkedOn: null }),
  CA: Object.freeze({ name: 'Credit Counselling Canada', url: 'https://creditcounsellingcanada.ca', checkedOn: null }),
});

export function freeHelpFor(country: string | null): FreeHelpEntry | null {
  if (country === null || !Object.prototype.hasOwnProperty.call(FREE_HELP, country)) return null;
  return FREE_HELP[country] as FreeHelpEntry;
}

/** D-63 / D-65: the variants that say the usual month is already short. */
const MONTH_SHORT_VARIANTS: readonly string[] = Object.freeze(['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra']);

/** D-123: every answer whose usual month is short: Short each month (any variant) and every month-already-short answer. */
export function usualMonthShort(r: Pick<Result, 'code' | 'variant' | 'readiness'>): boolean {
  if (r.code === 'needs_input' || r.readiness?.ready === false) return false;
  return r.code === 'monthly_short' || (r.variant !== null && MONTH_SHORT_VARIANTS.includes(r.variant));
}

/** The free_help fact for a finished answer, or none. Never changes the answer (I76). */
export function freeHelpFacts(r: Pick<Result, 'code' | 'variant' | 'readiness'>, country: string | null): readonly Fact[] {
  const entry = freeHelpFor(country);
  if (entry === null || !usualMonthShort(r)) return [];
  return [{ code: 'free_help', values: { country: country as string, name: entry.name } }];
}
