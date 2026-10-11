// D-32: useLinkedFees reads a statement purchase's fee lines, and only for statement lines.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import type { DbClient } from '@/db/rows';
import { useLinkedFees } from '../transactions';

jest.mock('@/services/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFakeSupabase } = require('@/db/__tests__/fakeSupabase');
  return { supabase: createFakeSupabase() };
});

const fake = supabase as unknown as FakeSupabase & DbClient;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useLinkedFees', () => {
  beforeEach(() => {
    fake.calls.length = 0;
  });

  it('makes no request unless the row is a statement line', async () => {
    const { result } = await renderHook(() => useLinkedFees('h1', { id: 'p1', conversion_source: 'market' }), {
      wrapper: wrapper(newClient()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });

  it('returns the fee rows for a statement line', async () => {
    fake.respondWith({ data: [{ id: 'f1', original_amount: -42 }], error: null, status: 200 });
    const { result } = await renderHook(() => useLinkedFees('h1', { id: 'p1', conversion_source: 'statement' }), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(fake.calls.find((c) => c.method === 'eq' && c.args[0] === 'fx_fee_of')?.args).toEqual(['fx_fee_of', 'p1']);
  });
});
