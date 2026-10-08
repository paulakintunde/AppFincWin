import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import { ISO_CURRENCIES } from '@/engine/money';
import type { CustomCurrencyRow } from '@/db/rows';
import { buildCurrencyOptions, useCurrencyOptions } from '../currencyOptions';
import { currencyPickerSections } from '../popularCurrencies';

function customRow(overrides: Partial<CustomCurrencyRow> = {}): CustomCurrencyRow {
  return {
    id: 'c1',
    owner_id: 'u1',
    code: 'GLD',
    symbol: 'g',
    decimals: 3,
    reference_currency: 'USD',
    unit_value: '2.5000000000',
    as_of: '2026-09-24',
    version: 1,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

describe('buildCurrencyOptions', () => {
  it('returns one iso option per built-in entry, rateDate null, sorted by code', () => {
    const options = buildCurrencyOptions(ISO_CURRENCIES, []);
    expect(options).toHaveLength(ISO_CURRENCIES.length);
    for (const option of options) {
      const entry = ISO_CURRENCIES.find((c) => c.code === option.code);
      expect(option).toEqual({
        code: entry?.code,
        name: entry?.name,
        symbol: entry?.symbol,
        exponent: entry?.exponent,
        kind: 'iso',
        rateDate: null,
      });
    }
    const codes = options.map((o) => o.code);
    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
  });

  it('offers every currency, including EUR, with no rate of any kind', () => {
    const codes = buildCurrencyOptions(ISO_CURRENCIES, []).map((o) => o.code);
    expect(codes).toContain('EUR');
    expect(codes).toContain('JPY');
  });

  it('takes the exponent from the built-in entry', () => {
    const options = buildCurrencyOptions([{ code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0 }], []);
    expect(options).toEqual([
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0, kind: 'iso', rateDate: null },
    ]);
  });

  it('includes custom currencies with kind custom, exponent = decimals, and rateDate = as_of', () => {
    const options = buildCurrencyOptions([], [customRow()]);
    expect(options).toEqual([
      { code: 'GLD', name: 'GLD', symbol: 'g', exponent: 3, kind: 'custom', rateDate: '2026-09-24' },
    ]);
  });

  it('sorts the merged list by code', () => {
    const iso = ISO_CURRENCIES.filter((c) => c.code === 'USD' || c.code === 'JPY');
    const options = buildCurrencyOptions(iso, [customRow({ code: 'AAA' })]);
    expect(options.map((o) => o.code)).toEqual(['AAA', 'JPY', 'USD']);
  });

  it('never lets a custom code duplicate an ISO one -- the ISO entry wins', () => {
    const iso = ISO_CURRENCIES.filter((c) => c.code === 'USD');
    const options = buildCurrencyOptions(iso, [customRow({ code: 'USD' })]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ code: 'USD', kind: 'iso' });
  });

  it('feeds the picker sections: home alone, all six continents in Popular, full A-Z', () => {
    const options = buildCurrencyOptions(ISO_CURRENCIES, []);
    const sections = currencyPickerSections(options, 'GBP');
    expect(sections.home?.code).toBe('GBP');
    expect(sections.popular.map((g) => g.continent)).toEqual([
      'northAmerica',
      'southAmerica',
      'europe',
      'asia',
      'africa',
      'oceania',
    ]);
    const popularCodes = sections.popular.flatMap((g) => g.options.map((o) => o.code));
    expect(popularCodes).not.toContain('GBP');
    expect(sections.all).toEqual(options);
  });
});

jest.mock('../customCurrencies', () => ({ useCustomCurrencies: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCustomCurrencies } = require('../customCurrencies') as { useCustomCurrencies: jest.Mock };

// Plain .ts (not .tsx), per this plan's file list -- React.createElement instead of JSX.
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useCurrencyOptions', () => {
  afterEach(() => jest.clearAllMocks());

  it('merges the built-in list with custom currencies and is not loading once they have loaded', async () => {
    useCustomCurrencies.mockReturnValue({ data: [customRow()], isLoading: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions('u1'), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(false);
    expect(result.current.options).toHaveLength(ISO_CURRENCIES.length + 1);
    expect(result.current.options.map((o) => o.code)).toContain('GLD');
  });

  it('reports loading while the custom-currencies read is in flight, with ISO options already present', async () => {
    useCustomCurrencies.mockReturnValue({ data: undefined, isLoading: true });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions('u1'), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(true);
    expect(result.current.options).toHaveLength(ISO_CURRENCIES.length);
  });

  it('is not loading and offers the full ISO list on first render when userId is undefined', async () => {
    useCustomCurrencies.mockReturnValue({ data: undefined, isLoading: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions(undefined), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(false);
    expect(result.current.options.map((o) => o.code)).toEqual(
      buildCurrencyOptions(ISO_CURRENCIES, []).map((o) => o.code)
    );
  });
});
