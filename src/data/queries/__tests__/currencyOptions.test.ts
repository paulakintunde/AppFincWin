import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { CurrencyRow, CustomCurrencyRow, FxLatestRow } from '@/db/rows';
import { buildCurrencyOptions, useCurrencyOptions } from '../currencyOptions';

const EUR: CurrencyRow = { code: 'EUR', iso_numeric: '978', name: 'Euro', symbol: '€', start_date: null, end_date: null };
const USD: CurrencyRow = { code: 'USD', iso_numeric: '840', name: 'US Dollar', symbol: '$', start_date: null, end_date: null };
const JPY: CurrencyRow = { code: 'JPY', iso_numeric: '392', name: 'Japanese Yen', symbol: '¥', start_date: null, end_date: null };
// No fx_latest rate exists for this one -- must be excluded (unlike EUR, which is special-cased).
const XYZ: CurrencyRow = { code: 'XYZ', iso_numeric: null, name: 'No-Rate Currency', symbol: null, start_date: null, end_date: null };

const USD_RATE: FxLatestRow = { quote: 'USD', rate: '1.1483000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };
const JPY_RATE: FxLatestRow = { quote: 'JPY', rate: '180.7000000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };

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
  it('includes EUR even though fx_rates has no EUR quote (EUR is the fx_rates base)', () => {
    const options = buildCurrencyOptions([EUR], [], []);
    expect(options).toEqual([{ code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, kind: 'iso', rateDate: null }]);
  });

  it('excludes a non-EUR currency with no fx_latest rate', () => {
    const options = buildCurrencyOptions([USD, XYZ], [USD_RATE], []);
    expect(options.map((o) => o.code)).toEqual(['USD']);
  });

  it('resolves the ISO exponent from engine/money and carries the rate date', () => {
    const options = buildCurrencyOptions([JPY], [JPY_RATE], []);
    expect(options).toEqual([
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0, kind: 'iso', rateDate: '2026-09-21' },
    ]);
  });

  it('includes custom currencies with kind custom, exponent = decimals, and rateDate = as_of', () => {
    const options = buildCurrencyOptions([], [], [customRow()]);
    expect(options).toEqual([{ code: 'GLD', name: 'GLD', symbol: 'g', exponent: 3, kind: 'custom', rateDate: '2026-09-24' }]);
  });

  it('sorts the merged list by code', () => {
    const options = buildCurrencyOptions([USD, JPY], [USD_RATE, JPY_RATE], [customRow({ code: 'AAA' })]);
    expect(options.map((o) => o.code)).toEqual(['AAA', 'JPY', 'USD']);
  });

  it('never lets a custom code duplicate an ISO one -- the ISO entry wins', () => {
    const options = buildCurrencyOptions([USD], [USD_RATE], [customRow({ code: 'USD' })]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ code: 'USD', kind: 'iso' });
  });
});

jest.mock('../currencies', () => ({ useCurrencies: jest.fn() }));
jest.mock('../fxLatest', () => ({ useFxLatest: jest.fn() }));
jest.mock('../customCurrencies', () => ({ useCustomCurrencies: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCurrencies } = require('../currencies') as { useCurrencies: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useFxLatest } = require('../fxLatest') as { useFxLatest: jest.Mock };
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

  it('merges the three underlying reads via buildCurrencyOptions and reports loading only while any is loading', async () => {
    useCurrencies.mockReturnValue({ data: [USD], isLoading: false });
    useFxLatest.mockReturnValue({ data: [USD_RATE], isLoading: false });
    useCustomCurrencies.mockReturnValue({ data: [customRow()], isLoading: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions('u1'), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(false);
    expect(result.current.options.map((o) => o.code)).toEqual(['GLD', 'USD']);
  });

  it('reports loading while the custom-currencies read is still in flight', async () => {
    useCurrencies.mockReturnValue({ data: [USD], isLoading: false });
    useFxLatest.mockReturnValue({ data: [USD_RATE], isLoading: false });
    useCustomCurrencies.mockReturnValue({ data: undefined, isLoading: true });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions('u1'), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(true);
  });

  it('does not count the disabled custom-currencies read against loading when userId is undefined', async () => {
    useCurrencies.mockReturnValue({ data: [USD], isLoading: false });
    useFxLatest.mockReturnValue({ data: [USD_RATE], isLoading: false });
    useCustomCurrencies.mockReturnValue({ data: undefined, isLoading: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useCurrencyOptions(undefined), { wrapper: wrapper(qc) });

    expect(result.current.loading).toBe(false);
    expect(result.current.options.map((o) => o.code)).toEqual(['USD']);
  });
});
