/**
 * 05.4 FIN-27 / ARC-25 (D-18, D-19): the usual sales tax rate for each US state (plus DC) and each Canadian province and
 * territory. Estimates the user can change (CMP-F24). Refresh each January and July. No default APR anywhere (05.1 D-07, ARC-25).
 *
 * Data, not behaviour: the only reader is tax/lookup.ts (one owner for region defaults). UK and EU prices already include VAT
 * (D-19), so no rate is stored for them. Each row is a dated, sourced estimate from a primary source:
 * - US: Tax Foundation, "State and Local Sales Tax Rates" table as of 1 July 2026: the state rate plus the population-weighted
 *   average local rate (combined column). Alaska has no state tax and a 1.82% average local rate; Delaware, Montana, New Hampshire
 *   and Oregon have no sales tax (0%). New Jersey's average local rate is -0.02% (Salem County), so its combined rate is 6.60%.
 * - Canada: canada.ca "GST/HST calculator (and rates)", GST/HST and PST by province, rates on or after 1 April 2025 (page dated
 *   2025-04-01): HST provinces at the HST rate (Nova Scotia 14% from 1 April 2025, from canada.ca, not secondary sites); GST plus
 *   PST where a province charges PST; Quebec GST 5% + QST 9.975% = 14.975% (canada.ca lists the QST; Revenu Quebec's own page
 *   refused automated reads on 2026-11-04, so it was not fetched); GST alone where no provincial sales tax applies.
 */
import { percent, type Percent } from '../../../payoff/types';

export type TaxBasis = 'state_plus_average_local' | 'combined_gst_pst' | 'hst' | 'gst_qst' | 'gst_only';

export interface TaxDefault {
  readonly percent: Percent;
  readonly basis: TaxBasis;
  /** The date the source's figures apply from ('YYYY-MM-DD'). */
  readonly asOf: string;
  readonly source: string;
}

const US_AS_OF = '2026-07-01';
const US_SOURCE = 'Tax Foundation, State and Local Sales Tax Rates as of July 1, 2026 (taxfoundation.org/data/all/state/2026-sales-tax-rates/)';
const CA_AS_OF = '2025-04-01';
const CA_SOURCE = 'Canada Revenue Agency, GST/HST calculator (and rates), GST/HST and PST rates by province (canada.ca)';

/** Keyed '<country>-<subdivision>' (ISO 3166-2 codes). 51 US rows (50 states + DC) and 13 Canadian rows. */
export const TAX_DEFAULTS: Readonly<Record<string, TaxDefault>> = Object.freeze({
  'US-AL': { percent: percent('9.46'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Alabama
  'US-AK': { percent: percent('1.82'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Alaska
  'US-AZ': { percent: percent('8.54'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Arizona
  'US-AR': { percent: percent('9.48'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Arkansas
  'US-CA': { percent: percent('9.03'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // California
  'US-CO': { percent: percent('7.89'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Colorado
  'US-CT': { percent: percent('6.35'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Connecticut
  'US-DE': { percent: percent('0'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Delaware
  'US-DC': { percent: percent('6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // District of Columbia
  'US-FL': { percent: percent('6.98'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Florida
  'US-GA': { percent: percent('7.56'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Georgia
  'US-HI': { percent: percent('4.5'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Hawaii
  'US-ID': { percent: percent('6.03'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Idaho
  'US-IL': { percent: percent('8.98'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Illinois
  'US-IN': { percent: percent('7'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Indiana
  'US-IA': { percent: percent('6.94'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Iowa
  'US-KS': { percent: percent('8.71'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Kansas
  'US-KY': { percent: percent('6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Kentucky
  'US-LA': { percent: percent('10.13'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Louisiana
  'US-ME': { percent: percent('5.5'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Maine
  'US-MD': { percent: percent('6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Maryland
  'US-MA': { percent: percent('6.25'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Massachusetts
  'US-MI': { percent: percent('6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Michigan
  'US-MN': { percent: percent('8.14'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Minnesota
  'US-MS': { percent: percent('7.06'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Mississippi
  'US-MO': { percent: percent('8.44'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Missouri
  'US-MT': { percent: percent('0'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Montana
  'US-NE': { percent: percent('6.98'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Nebraska
  'US-NV': { percent: percent('8.24'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Nevada
  'US-NH': { percent: percent('0'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // New Hampshire
  'US-NJ': { percent: percent('6.6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // New Jersey
  'US-NM': { percent: percent('7.68'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // New Mexico
  'US-NY': { percent: percent('8.54'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // New York
  'US-NC': { percent: percent('7.1'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // North Carolina
  'US-ND': { percent: percent('7.09'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // North Dakota
  'US-OH': { percent: percent('7.29'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Ohio
  'US-OK': { percent: percent('9.06'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Oklahoma
  'US-OR': { percent: percent('0'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Oregon
  'US-PA': { percent: percent('6.34'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Pennsylvania
  'US-RI': { percent: percent('7'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Rhode Island
  'US-SC': { percent: percent('7.49'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // South Carolina
  'US-SD': { percent: percent('6.11'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // South Dakota
  'US-TN': { percent: percent('9.61'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Tennessee
  'US-TX': { percent: percent('8.2'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Texas
  'US-UT': { percent: percent('7.42'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Utah
  'US-VT': { percent: percent('6.43'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Vermont
  'US-VA': { percent: percent('5.77'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Virginia
  'US-WA': { percent: percent('9.57'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Washington
  'US-WV': { percent: percent('6.6'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // West Virginia
  'US-WI': { percent: percent('5.72'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Wisconsin
  'US-WY': { percent: percent('5.39'), basis: 'state_plus_average_local', asOf: US_AS_OF, source: US_SOURCE }, // Wyoming
  'CA-AB': { percent: percent('5'), basis: 'gst_only', asOf: CA_AS_OF, source: CA_SOURCE }, // Alberta
  'CA-BC': { percent: percent('12'), basis: 'combined_gst_pst', asOf: CA_AS_OF, source: CA_SOURCE }, // British Columbia
  'CA-MB': { percent: percent('12'), basis: 'combined_gst_pst', asOf: CA_AS_OF, source: CA_SOURCE }, // Manitoba
  'CA-NB': { percent: percent('15'), basis: 'hst', asOf: CA_AS_OF, source: CA_SOURCE }, // New Brunswick
  'CA-NL': { percent: percent('15'), basis: 'hst', asOf: CA_AS_OF, source: CA_SOURCE }, // Newfoundland and Labrador
  'CA-NT': { percent: percent('5'), basis: 'gst_only', asOf: CA_AS_OF, source: CA_SOURCE }, // Northwest Territories
  'CA-NS': { percent: percent('14'), basis: 'hst', asOf: CA_AS_OF, source: CA_SOURCE }, // Nova Scotia
  'CA-NU': { percent: percent('5'), basis: 'gst_only', asOf: CA_AS_OF, source: CA_SOURCE }, // Nunavut
  'CA-ON': { percent: percent('13'), basis: 'hst', asOf: CA_AS_OF, source: CA_SOURCE }, // Ontario
  'CA-PE': { percent: percent('15'), basis: 'hst', asOf: CA_AS_OF, source: CA_SOURCE }, // Prince Edward Island
  'CA-QC': { percent: percent('14.975'), basis: 'gst_qst', asOf: CA_AS_OF, source: CA_SOURCE }, // Quebec
  'CA-SK': { percent: percent('11'), basis: 'combined_gst_pst', asOf: CA_AS_OF, source: CA_SOURCE }, // Saskatchewan
  'CA-YT': { percent: percent('5'), basis: 'gst_only', asOf: CA_AS_OF, source: CA_SOURCE }, // Yukon
});
