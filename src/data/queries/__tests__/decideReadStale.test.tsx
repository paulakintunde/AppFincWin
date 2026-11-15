// 06.1-78 (G-72-2): inside a Decide screen the record-context reads (money prefs, record prefs, the horizon, sample data) and the
// answer's savings-goal read stay fresh for DECIDE_READ_STALE_MS, so the answer's mount does not refetch them. Outside Decide
// they keep the app default, and a write's invalidation still refetches them at once.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { useRecordContext } from '@/features/record/useRecordContext';
import { DECIDE_READ_STALE_MS, DecideReadStaleContext, useDecideReadStale } from '../decideStale';
import { useSavingsGoalRows } from '../growGoals';

const mockFetch = {
  money: jest.fn(async () => ({ home_currency: 'CAD', show_cents: true, lead_figure: 'home', region: 'CA' })),
  record: jest.fn(async () => ({ week_start: 1, sample_prompt_answered_at: null })),
  horizon: jest.fn(async () => '2026-01'),
  samples: jest.fn(async () => false),
  goals: jest.fn(async () => []),
};
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/profile', () => ({ fetchMoneyPrefs: () => mockFetch.money() }));
jest.mock('@/db/recordPrefs', () => ({ fetchRecordPrefs: () => mockFetch.record(), fetchHouseholdHorizon: () => mockFetch.horizon() }));
jest.mock('@/db/samples', () => ({ fetchSampleDataExists: () => mockFetch.samples() }));
jest.mock('@/db/savingsGoals', () => ({ fetchSavingsGoals: () => mockFetch.goals() }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'u1' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h1', isLoading: false }) }));

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });

function wrapper(client: QueryClient, stale?: number) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DecideReadStaleContext.Provider value={stale}>{children}</DecideReadStaleContext.Provider>
      </QueryClientProvider>
    );
  };
}

const calls = () => ({
  money: mockFetch.money.mock.calls.length,
  record: mockFetch.record.mock.calls.length,
  horizon: mockFetch.horizon.mock.calls.length,
  samples: mockFetch.samples.mock.calls.length,
});

/** Mount once to fill the cache, then age every entry by two minutes: past the 60 s default, inside Decide's five. */
async function primed(): Promise<QueryClient> {
  const client = newClient();
  const first = await renderHook(() => useRecordContext(), { wrapper: wrapper(client) });
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await waitFor(() => expect(mockFetch.horizon).toHaveBeenCalled());
  await first.unmount();
  const aged = Date.now() - 120_000;
  for (const q of client.getQueryCache().getAll()) client.setQueryData(q.queryKey, q.state.data, { updatedAt: aged });
  return client;
}

beforeEach(() => Object.values(mockFetch).forEach((f) => f.mockClear()));

describe('Decide read freshness (06.1-78, G-72-2)', () => {
  it('is undefined outside a Decide screen and five minutes inside one', async () => {
    const out = await renderHook(() => useDecideReadStale(), { wrapper: wrapper(newClient()) });
    expect(out.result.current).toBeUndefined();
    const inside = await renderHook(() => useDecideReadStale(), { wrapper: wrapper(newClient(), DECIDE_READ_STALE_MS) });
    expect(inside.result.current).toBe(DECIDE_READ_STALE_MS);
  });

  it('a Decide screen mounting does not refetch the record-context reads; a write invalidation still refetches at once', async () => {
    const client = await primed();
    const before = calls();
    const decide = await renderHook(() => useRecordContext(), { wrapper: wrapper(client, DECIDE_READ_STALE_MS) });
    expect(decide.result.current.homeCurrency).toBe('CAD');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(calls()).toEqual(before);

    // a write's invalidation refetches each key at once, whatever the observer's staleTime
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.moneyPrefs('u1') });
      await client.invalidateQueries({ queryKey: queryKeys.recordPrefs('u1') });
      await client.invalidateQueries({ queryKey: queryKeys.householdHorizon('h1') });
      await client.invalidateQueries({ queryKey: queryKeys.sampleExists('h1') });
    });
    await waitFor(() => expect(calls()).toEqual({ money: before.money + 1, record: before.record + 1, horizon: before.horizon + 1, samples: before.samples + 1 }));
  });

  it('outside Decide the same two-minute-old reads refetch on mount (the app default is kept)', async () => {
    const client = await primed();
    const before = calls();
    await renderHook(() => useRecordContext(), { wrapper: wrapper(client) });
    await waitFor(() => expect(calls()).toEqual({ money: before.money + 1, record: before.record + 1, horizon: before.horizon + 1, samples: before.samples + 1 }));
  });

  it('the savings-goal read takes the same staleTime; a write invalidation still refetches it', async () => {
    const client = newClient();
    const first = await renderHook(() => useSavingsGoalRows('u1', 'h1'), { wrapper: wrapper(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await first.unmount();
    const key = queryKeys.savingsGoals('u1', 'h1');
    client.setQueryData(key, client.getQueryData(key), { updatedAt: Date.now() - 120_000 });
    const n = mockFetch.goals.mock.calls.length;
    const fresh = await renderHook(() => useSavingsGoalRows('u1', 'h1', { staleTime: DECIDE_READ_STALE_MS }), { wrapper: wrapper(client) });
    expect(fresh.result.current.isSuccess).toBe(true);
    expect(mockFetch.goals.mock.calls.length).toBe(n);
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    await waitFor(() => expect(mockFetch.goals.mock.calls.length).toBe(n + 1));
  });
});
