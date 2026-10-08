// Pure data + function for the picker's Popular section. Kept apart from currencyOptions.ts
// (which holds the React Query hook) so it is importable without the data layer.
import type { CurrencyOption } from './currencyOptions';

// 2026-10-07 amendment to D-08: the picker leads with a curated "Popular" section. This is
// presentation only -- A-Z below it stays the complete list, so every currency is still available.
export type Continent = 'northAmerica' | 'southAmerica' | 'europe' | 'asia' | 'africa' | 'oceania';

export const POPULAR_CURRENCY_GROUPS: readonly { continent: Continent; codes: readonly string[] }[] = [
  { continent: 'northAmerica', codes: ['USD', 'CAD', 'MXN'] },
  { continent: 'southAmerica', codes: ['BRL', 'ARS', 'COP', 'CLP'] },
  { continent: 'europe', codes: ['EUR', 'GBP', 'CHF', 'SEK'] },
  { continent: 'asia', codes: ['CNY', 'JPY', 'INR', 'KRW'] },
  { continent: 'africa', codes: ['NGN', 'ZAR', 'EGP', 'KES'] },
  { continent: 'oceania', codes: ['AUD', 'NZD'] },
];

export interface CurrencyPickerSections {
  home: CurrencyOption | null;
  popular: { continent: Continent; options: CurrencyOption[] }[];
  all: CurrencyOption[];
}

/**
 * Splits the picker options into "Your currency", "Popular" (by continent) and "All currencies".
 * Only currencies present in `options` are offered (none is invented). The home currency is not
 * repeated in Popular. `all` is `options` unchanged: a currency shown above also stays in A-Z.
 */
export function currencyPickerSections(options: readonly CurrencyOption[], homeCurrency: string): CurrencyPickerSections {
  const byCode = new Map(options.map((option) => [option.code, option]));
  const popular: CurrencyPickerSections['popular'] = [];
  for (const group of POPULAR_CURRENCY_GROUPS) {
    const offered = group.codes
      .filter((code) => code !== homeCurrency)
      .map((code) => byCode.get(code))
      .filter((option): option is CurrencyOption => option !== undefined);
    if (offered.length > 0) popular.push({ continent: group.continent, options: offered });
  }
  return { home: byCode.get(homeCurrency) ?? null, popular, all: [...options] };
}
