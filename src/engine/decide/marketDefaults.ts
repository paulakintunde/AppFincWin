/**
 * Data, not behaviour (D-05). The snapshot builder picks a row from the user's region preference, falling back to CA
 * for Canada (RESEARCH open question 2), and pre-fills card terms and the check's dealer cap, converting the floor into
 * the check's currency first (D-16 clarified). No module on the verdict path imports this file. Adding a market is a
 * new row. Unsourced values are null — never borrowed from another market. There is no default APR anywhere (D-07).
 */
import { minorUnits, currencyCode, type CurrencyCode, type MinorUnits } from '../money/types';
import { percent, type CardMinimumTerms, type Percent } from '../payoff/types';

export type MarketKey = 'US' | 'CA' | 'CA-QC' | 'UK';

export interface MarketDefaultsRow {
  readonly currency: CurrencyCode;
  readonly minimumPercent: Percent | null;
  readonly interestAdded: boolean | null;
  readonly floor: MinorUnits | null;
  readonly dealerCap: MinorUnits | null;
}

export const MARKET_DEFAULTS: Readonly<Record<MarketKey, MarketDefaultsRow>> = {
  // US minimum: 1% + interest, $25 floor — Capital One / Citi base tier (wallethub.com, LOW-MEDIUM); Chase uses $40
  // (chase.com/personal/credit-cards/education/basics/how-to-calculate-your-minimum-credit-card-payment); MEDIUM overall.
  // Dealer cap $5,000 — consumer-finance sources converge on $2,000–$5,000 (choosefi.com et al., LOW).
  US: {
    currency: currencyCode('USD'),
    minimumPercent: percent('1'),
    interestAdded: true,
    floor: minorUnits(2_500),
    dealerCap: minorUnits(500_000),
  },
  // CA (outside Quebec): greater of 2% or $10 — TD/RBC/Scotiabank/BMO via ratehub.ca / nerdwallet.ca (MEDIUM);
  // interest-inclusion is LOW confidence. Dealer cap: no source, so null.
  CA: {
    currency: currencyCode('CAD'),
    minimumPercent: percent('2'),
    interestAdded: false,
    floor: minorUnits(1_000),
    dealerCap: null,
  },
  // CA-QC: 5% minimum since 1 Aug 2025 (Quebec Bill 134; ratehub.ca, money.ca). Floor and interest treatment unsourced → null.
  'CA-QC': {
    currency: currencyCode('CAD'),
    minimumPercent: percent('5'),
    interestAdded: null,
    floor: null,
    dealerCap: null,
  },
  // UK: FCA CONC 6.7.5R — at least interest + fees + 1% of balance (HIGH; https://handbook.fca.org.uk/handbook/CONC/6/7.html);
  // the £5 practical floor comes from secondary sources (MEDIUM). Dealer cap: no source, so null.
  UK: {
    currency: currencyCode('GBP'),
    minimumPercent: percent('1'),
    interestAdded: true,
    floor: minorUnits(500),
    dealerCap: null,
  },
};

/** Card minimum terms from a row, or null when any of the three fields is null (never borrowed from another row). */
export function minimumTermsFromDefaults(row: MarketDefaultsRow): CardMinimumTerms | null {
  if (row.minimumPercent === null || row.interestAdded === null || row.floor === null) {
    return null;
  }
  return { minimumPercent: row.minimumPercent, interestAdded: row.interestAdded, floor: row.floor };
}
