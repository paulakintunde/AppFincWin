// D-08: the currency picker's data source is every currency fx-sync stores (~171, plus EUR
// itself) with no curated shortlist, plus the user's own custom currencies. buildCurrencyOptions
// is the pure merge step (unit-testable without a QueryClient); useCurrencyOptions is the hook
// Record's picker (Phase 2) will call.
import { currencyExponent } from '@/engine/money';
import type { CurrencyRow, CustomCurrencyRow, FxLatestRow } from '@/db/rows';
import { useCurrencies } from './currencies';
import { useCustomCurrencies } from './customCurrencies';
import { useFxLatest } from './fxLatest';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string | null;
  exponent: number;
  kind: 'iso' | 'custom';
  rateDate: string | null;
}

/**
 * Merges the ISO currency set with the user's custom currencies into one sorted picker list
 * (D-08). An ISO currency with no `fx_latest` quote is excluded (there is no rate to convert
 * with) -- except EUR, which fx-sync never carries as a quote of itself (fx_rates is
 * EUR-based) but must always be offered. A custom code that happens to collide with an ISO
 * code never appears twice -- the ISO entry wins (the guard trigger in
 * 20260924000100_custom_currencies.sql already prevents a user from creating one, so this is
 * belt-and-braces, not the primary defence).
 */
export function buildCurrencyOptions(
  currencies: readonly CurrencyRow[],
  latest: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[]
): CurrencyOption[] {
  const latestByCode = new Map(latest.map((rate) => [rate.quote, rate]));

  const isoOptions: CurrencyOption[] = [];
  for (const currency of currencies) {
    if (currency.code === 'EUR') {
      isoOptions.push({
        code: 'EUR',
        name: currency.name,
        symbol: currency.symbol,
        exponent: currencyExponent('EUR'),
        kind: 'iso',
        rateDate: null,
      });
      continue;
    }

    const rate = latestByCode.get(currency.code);
    if (!rate) continue; // no fx_latest rate -- nothing to convert with, so not offered

    isoOptions.push({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      exponent: currencyExponent(currency.code),
      kind: 'iso',
      rateDate: rate.rate_date,
    });
  }

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
  const currencies = useCurrencies();
  const fxLatest = useFxLatest();
  const customCurrencies = useCustomCurrencies(userId);

  const loading = currencies.isLoading || fxLatest.isLoading || (Boolean(userId) && customCurrencies.isLoading);
  const options = buildCurrencyOptions(currencies.data ?? [], fxLatest.data ?? [], customCurrencies.data ?? []);

  return { options, loading };
}
