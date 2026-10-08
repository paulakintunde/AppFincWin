// Behavior-level proof that each read hook queries the right table/RPC with the right
// filters and serves the fake client's data back through the hook -- '@/services/supabase'
// is mocked to a FakeSupabase instance so no hook here ever touches the real client (and
// never triggers its eager getEnv() call).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { useAccounts } from '../accounts';
import { useCurrencies } from '../currencies';
import { useFxLatest } from '../fxLatest';
import { useHouseholdId } from '../household';
import { useTransactionsForMonth } from '../transactions';

jest.mock('@/services/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFakeSupabase } = require('@/db/__tests__/fakeSupabase');
  return { supabase: createFakeSupabase() };
});

const fakeClient = supabase as unknown as FakeSupabase & DbClient;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  fakeClient.calls.length = 0;
});

describe('useHouseholdId', () => {
  it("fetches household_members.household_id for the user, limited to 1", async () => {
    fakeClient.respondWith({ data: { household_id: 'h1' }, error: null, status: 200 });

    const { result } = await renderHook(() => useHouseholdId('u1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toBe('h1'));
    expect(fakeClient.calls[0]).toMatchObject({ table: 'household_members', method: 'select' });
    expect(fakeClient.calls.find((c) => c.method === 'eq')?.args).toEqual(['user_id', 'u1']);
    expect(fakeClient.calls.find((c) => c.method === 'limit')?.args).toEqual([1]);
  });

  it('stays idle and issues no query when userId is empty', async () => {
    const { result } = await renderHook(() => useHouseholdId(undefined), { wrapper: wrapper(newClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fakeClient.calls).toHaveLength(0);
  });
});

describe('useAccounts', () => {
  it('fetches accounts filtered by household id and returns the data', async () => {
    const accounts = [{ id: 'a1', name: 'Everyday chequing' }];
    fakeClient.respondWith({ data: accounts, error: null, status: 200 });

    const { result } = await renderHook(() => useAccounts('h1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(accounts));
    expect(fakeClient.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
  });
});

describe('useTransactionsForMonth', () => {
  it("bounds local_date to the given month via engine/time's monthRange and returns the data", async () => {
    const transactions = [{ id: 't1', local_date: '2026-12-15' }];
    fakeClient.respondWith({ data: transactions, error: null, status: 200 });

    const { result } = await renderHook(() => useTransactionsForMonth('h1', '2026-12'), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.data).toEqual(transactions));
    expect(fakeClient.calls.find((c) => c.method === 'gte')?.args).toEqual(['local_date', '2026-12-01']);
    expect(fakeClient.calls.find((c) => c.method === 'lt')?.args).toEqual(['local_date', '2027-01-01']);
  });

  it('stays idle when month is not yet provided', async () => {
    const { result } = await renderHook(() => useTransactionsForMonth('h1', undefined), {
      wrapper: wrapper(newClient()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fakeClient.calls).toHaveLength(0);
  });
});

describe('useCurrencies', () => {
  it('fetches active currencies (end_date is null), ordered by code', async () => {
    const currencies = [{ code: 'USD', iso_numeric: '840', name: 'US Dollar', symbol: '$', start_date: null, end_date: null }];
    fakeClient.respondWith({ data: currencies, error: null, status: 200 });

    const { result } = await renderHook(() => useCurrencies(), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(currencies));
    expect(fakeClient.calls.find((c) => c.method === 'is')?.args).toEqual(['end_date', null]);
    expect(fakeClient.calls.find((c) => c.method === 'order')?.args).toEqual(['code', { ascending: true }]);
  });
});

describe('useFxLatest', () => {
  it("calls the fx_latest_rates rpc and returns the app's own store's rates", async () => {
    const rates = [{ quote: 'CAD', rate: '1.35', rate_date: '2026-09-20', source: 'frankfurter-v2' }];
    fakeClient.respondWith({ data: rates, error: null, status: 200 });

    const { result } = await renderHook(() => useFxLatest(), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(rates));
    expect(fakeClient.calls.find((c) => c.method === 'rpc')?.args[0]).toBe('fx_latest_rates');
  });
});
