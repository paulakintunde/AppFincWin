// 02.2-28 Task 1 (REC-25, D-22): rates first, RPC second, all-or-nothing.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { DEFAULT_MONEY_PREFS } from '@/data/queries/moneyPrefs';
import { VersionConflictError } from '@/db/errors';
import { RatesUnavailableError } from '@/db/recordPrefs';
import { useChangeHomeCurrency } from '../homeCurrency';

const mockFetchRates = jest.fn();
const mockChange = jest.fn();
jest.mock('../homeCurrencyRates', () => ({ fetchRatesForHomeChange: (...a: unknown[]) => mockFetchRates(...a) }));
jest.mock('@/db/recordPrefs', () => ({
  ...jest.requireActual('@/db/recordPrefs'),
  changeHomeCurrency: (...a: unknown[]) => mockChange(...a),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('../writeClient', () => ({ writeClient: async () => ({ fake: true }) }));

const ctx = { userId: 'u1', householdId: 'h1', currentHome: 'GBP' };
let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mockFetchRates.mockReset();
  mockChange.mockReset();
  qc = new QueryClient();
  qc.setQueryData(queryKeys.moneyPrefs('u1'), { ...DEFAULT_MONEY_PREFS, home_currency: 'GBP' });
});

const run = async () => {
  const { result } = await renderHook(() => useChangeHomeCurrency(ctx), { wrapper });
  let out: unknown;
  await act(async () => {
    out = await result.current.change('USD');
  });
  return { out, result };
};
const home = () => (qc.getQueryData(queryKeys.moneyPrefs('u1')) as { home_currency: string }).home_currency;

describe('useChangeHomeCurrency', () => {
  it('fetches rates first, then applies, updates prefs and reports caps converted', async () => {
    const order: string[] = [];
    mockFetchRates.mockImplementation(async () => {
      order.push('rates');
      return 'done';
    });
    mockChange.mockImplementation(async () => {
      order.push('rpc');
      return { status: 'applied', capsConverted: 3 };
    });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { out } = await run();
    expect(order).toEqual(['rates', 'rpc']);
    expect(mockFetchRates.mock.calls[0][1]).toMatchObject({ next: 'USD', previous: 'GBP', householdId: 'h1' });
    expect(mockChange.mock.calls[0][1]).toMatchObject({ next: 'USD', from: 'GBP' });
    expect(out).toEqual({ ok: true, capsConverted: 3 });
    expect(home()).toBe('USD');
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.categories('u1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.fxLatest() });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
  });

  it('never calls the RPC when rates fail', async () => {
    mockFetchRates.mockResolvedValue('failed');
    const { out } = await run();
    expect(out).toEqual({ ok: false, reason: 'rates' });
    expect(mockChange).not.toHaveBeenCalled();
    expect(home()).toBe('GBP');
  });

  it('maps RatesUnavailableError and network errors to rates, leaving prefs unchanged', async () => {
    mockFetchRates.mockResolvedValue('done');
    mockChange.mockRejectedValueOnce(new RatesUnavailableError());
    expect((await run()).out).toEqual({ ok: false, reason: 'rates' });
    mockChange.mockRejectedValueOnce(new Error('Network request failed'));
    expect((await run()).out).toEqual({ ok: false, reason: 'rates' });
    expect(home()).toBe('GBP');
  });

  it('maps a version conflict to changed and invalidates prefs', async () => {
    mockFetchRates.mockResolvedValue('done');
    mockChange.mockRejectedValue(new VersionConflictError('profiles', 'GBP', null));
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect((await run()).out).toEqual({ ok: false, reason: 'changed' });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.moneyPrefs('u1') });
    expect(home()).toBe('GBP');
  });

  it('is pending while running', async () => {
    let release: (v: string) => void = () => undefined;
    mockFetchRates.mockReturnValue(new Promise((r) => (release = r)));
    const { result } = await renderHook(() => useChangeHomeCurrency(ctx), { wrapper });
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.change('USD');
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      release('failed');
      await p;
    });
    expect(result.current.pending).toBe(false);
  });
});
