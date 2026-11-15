// 05.5-09 (APP-08 steps 1-2): how many reads does the Decide scope make? One DecideV3Scope runs the 17-read snapshot, the five
// settings reads and the record-context reads. The Supabase client is a recorder: every `.from(table)` and `.rpc(name)` is
// counted, and every chain resolves with an empty result. The household and auth reads are mocked (they are shared by the
// whole app, not Decide's), so they are not counted. No device was used: these are jest counts through the real React Query client.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { DecideV3Scope, useDecideV3 } from '../decideV3';

const mockCalls: string[] = [];
jest.mock('@/services/supabase', () => {
  const profile = { home_currency: 'CAD', show_cents: true, lead_figure: 'home', region: 'CA' };
  const chain = (data: unknown): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data, error: null, count: 0, status: 200 });
        return () => chain(data);
      },
    });
  return {
    supabase: {
      from: (table: string) => {
        mockCalls.push(table);
        return chain(table === 'profiles' ? profile : []);
      },
      rpc: (name: string) => {
        mockCalls.push(`rpc:${name}`);
        return chain(name === 'sample_data_exists' ? false : name === 'fx_latest_rates' ? [{ quote: 'USD', rate: '0.73', rate_date: '2026-10-01', source: 'test' }] : []);
      },
    },
  };
});
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'u1' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h1', isLoading: false }) }));

// the app's own default (src/data/queryClient.ts): 60 s
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: Infinity } } });

function Consumer() {
  useDecideV3();
  return null;
}
const tree = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <DecideV3Scope>
      <Consumer />
    </DecideV3Scope>
  </QueryClientProvider>
);

const settle = () => act(async () => new Promise((r) => setTimeout(r, 60)));
const tally = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const c of mockCalls) out[c] = (out[c] ?? 0) + 1;
  return out;
};

beforeEach(() => {
  mockCalls.length = 0;
});

describe('Decide scope reads (APP-08)', () => {
  it('first mount reads each table once, the same list a second mount would skip', async () => {
    const client = newClient();
    const view = await render(tree(client));
    await waitFor(() => expect(mockCalls.length).toBeGreaterThan(10));
    await settle();
    // The measured list (pinned): 23 calls over 19 tables. profiles x3 are three different columns sets (money prefs, record prefs,
    // region subdivision); transactions_active x2 is history and upcoming; decide_links x2 is the plan links and the payment
    // links. Nothing is read twice under one key.
    expect(tally()).toEqual({
      profiles: 3,
      households: 1,
      'rpc:sample_data_exists': 1,
      transactions_active: 2,
      accounts: 1,
      'rpc:account_balances': 1,
      recurring_series: 1,
      'rpc:fx_latest_rates': 1,
      categories: 1,
      custom_currencies: 1,
      decide_settings: 1,
      debts: 1,
      savings_goals: 1,
      statement_periods_live: 1,
      decide_changes: 1,
      decide_checks: 1,
      decide_links: 2,
      decide_answers: 1,
      recurring_dismissals: 1,
    });
    expect(mockCalls).toHaveLength(23);
    await view.unmount();
  });

  it('a second mount inside the stale window makes 0 reads (fresh, and aged two minutes past the 60 s default)', async () => {
    const client = newClient();
    const first = await render(tree(client));
    await waitFor(() => expect(mockCalls.length).toBeGreaterThan(10));
    await settle();
    await first.unmount();

    // fresh remount
    mockCalls.length = 0;
    const second = await render(tree(client));
    await settle();
    expect([...mockCalls]).toHaveLength(0);
    await second.unmount();

    // age every entry two minutes: past the app's 60 s default, inside Decide's five
    const aged = Date.now() - 120_000;
    for (const q of client.getQueryCache().getAll()) client.setQueryData(q.queryKey, q.state.data, { updatedAt: aged });
    mockCalls.length = 0;
    const third = await render(tree(client));
    await settle();
    const calls = [...mockCalls];
    expect(calls).toHaveLength(0);
    await third.unmount();
  });

  it('a transactions-side invalidation refetches only the reads keyed on that table', async () => {
    const client = newClient();
    const view = await render(tree(client));
    await waitFor(() => expect(mockCalls.length).toBeGreaterThan(10));
    await settle();
    mockCalls.length = 0;
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.transactionsRoot('h1') });
    });
    await settle();
    // Only what sits under the transactions key: history and upcoming, the balances, the statement periods and the sample check.
    // Settings, checks, answers, links, categories, debts, goals and the rest are not touched.
    expect(tally()).toEqual({ transactions_active: 2, 'rpc:account_balances': 1, statement_periods_live: 1, 'rpc:sample_data_exists': 1 });
    await view.unmount();
  });
});
