import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { useDecideAnswers } from '../decideAnswers';
import { useIncomePayerPrompts } from '../incomePayerPrompts';
import { useRecurringDismissals } from '../recurringDismissals';

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { fake, qc, wrapper };
}

describe('new table read hooks', () => {
  it('useDecideAnswers is disabled without ids and reads this user\'s rows when set', async () => {
    const { fake, qc, wrapper } = setup();
    const off = await renderHook(() => useDecideAnswers(undefined, 'h1'), { wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    fake.respondWith({ data: [{ id: 'a1' }], error: null, status: 200 });
    const on = await renderHook(() => useDecideAnswers('u1', 'h1'), { wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(on.result.current.data).toEqual([{ id: 'a1' }]);
    expect(fake.calls.find((c) => c.method === 'eq' && c.args[0] === 'created_by')?.args).toEqual(['created_by', 'u1']);
    expect(qc.getQueryData(queryKeys.decideAnswers('u1', 'h1'))).toEqual([{ id: 'a1' }]);
  });

  it('useRecurringDismissals reads live rows once the household is known', async () => {
    const { fake, qc, wrapper } = setup();
    const off = await renderHook(() => useRecurringDismissals(undefined), { wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    fake.respondWith({ data: [{ id: 'd1' }], error: null, status: 200 });
    const on = await renderHook(() => useRecurringDismissals('h1'), { wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(fake.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(qc.getQueryData(queryKeys.recurringDismissals('h1'))).toEqual([{ id: 'd1' }]);
  });

  it('useIncomePayerPrompts reads live rows once the household is known', async () => {
    const { fake, qc, wrapper } = setup();
    const off = await renderHook(() => useIncomePayerPrompts(undefined), { wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    fake.respondWith({ data: [{ id: 'p1' }], error: null, status: 200 });
    const on = await renderHook(() => useIncomePayerPrompts('h1'), { wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(queryKeys.incomePayerPrompts('h1'))).toEqual([{ id: 'p1' }]);
  });
});
