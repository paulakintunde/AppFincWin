// D-08 as amended by 02-DECISION-fx-on-demand.md: the currency picker's ISO data source is the
// list built into the app (engine/money ISO_CURRENCIES), plus the user's own custom currencies.
// It has no dependency on any rate, on the server `currencies` table or on the network, so it
// works with empty tables and on first launch offline. buildCurrencyOptions is the pure merge
// step (unit-testable without a QueryClient); useCurrencyOptions is the hook Record's picker calls.
import { ISO_CURRENCIES } from '@/engine/money';
import type { IsoCurrency } from '@/engine/money';
import type { CustomCurrencyRow } from '@/db/rows';
import { useCustomCurrencies } from './customCurrencies';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string | null;
  exponent: number;
  kind: 'iso' | 'custom';
  rateDate: string | null;
}

/**
 * Merges the built-in ISO list with the user's custom currencies into one sorted picker list.
 * ISO options always carry `rateDate: null` (the picker depends on no rate); custom options
 * carry their `as_of`. A custom code that happens to collide with an ISO code never appears
 * twice -- the ISO entry wins (the guard trigger in 20260924000100_custom_currencies.sql already
 * prevents a user from creating one, so this is belt-and-braces, not the primary defence).
 */
export function buildCurrencyOptions(
  iso: readonly IsoCurrency[],
  customs: readonly CustomCurrencyRow[]
): CurrencyOption[] {
  const isoOptions: CurrencyOption[] = iso.map((currency) => ({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    exponent: currency.exponent,
    kind: 'iso' as const,
    rateDate: null,
  }));

  const isoCodes = new Set(isoOptions.map((option) => option.code));
  const customOptions: CurrencyOption[] = customs
    .filter((custom) => !isoCodes.has(custom.code))
    .map((custom) => ({
      code: custom.code,
      name: custom.code,
      symbol: custom.symbol,
      exponent: custom.decimals,
      kind: 'custom' as const,
      rateDate: custom.as_of,
    }));

  return [...isoOptions, ...customOptions].sort((a, b) => a.code.localeCompare(b.code));
}

export function useCurrencyOptions(userId?: string): { options: CurrencyOption[]; loading: boolean } {
  const customCurrencies = useCustomCurrencies(userId);

  const loading = Boolean(userId) && customCurrencies.isLoading;
  const options = buildCurrencyOptions(ISO_CURRENCIES, customCurrencies.data ?? []);

  return { options, loading };
}
