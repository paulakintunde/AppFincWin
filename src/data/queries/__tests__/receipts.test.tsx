// 10.1-11 (RCP-01): the receipt rows of one line; disabled until both ids exist; rows only (no signed links).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createFakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { useReceipts } from '../receipts';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useReceipts', () => {
  it('reads the rows of one line under the receipts key', async () => {
    const fake = createFakeSupabase();
    mockActiveClient = fake;
    fake.respondWith({ data: [{ id: 'r1', transaction_id: 't1' }], error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useReceipts('h1', 't1'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'r1', transaction_id: 't1' }]));
    expect(qc.getQueryData(queryKeys.receipts('h1', 't1'))).toBeDefined();
    expect(fake.calls.find((c) => c.method === 'in')?.args).toEqual(['transaction_id', ['t1']]);
  });

  it('does not read without a household or a line', async () => {
    const fake = createFakeSupabase();
    mockActiveClient = fake;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useReceipts('h1', undefined), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });
});
