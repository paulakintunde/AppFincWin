// Regression (02.3 walkthrough, 2026-10-13): the dismissed-offer keys used to be cached as a Set.
// The persisted query cache round-trips through JSON, so after a cold start the Set came back as
// {} and Activity crashed in selectOffers (`dismissedKeys.has is not a function`).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { useDismissedOffers } from '../recordPrefs';

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

describe('useDismissedOffers', () => {
  it('caches a JSON-safe array and exposes a Set', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [{ offer_key: 'a' }, { offer_key: 'b' }], error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useDismissedOffers('u1'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.keys.has('a')).toBe(true);
    const cached = qc.getQueryData(queryKeys.dismissedOffers('u1'));
    expect(JSON.parse(JSON.stringify(cached))).toEqual(['a', 'b']);
  });

  it('reads a cache restored as {} as no keys instead of crashing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(queryKeys.dismissedOffers('u1'), JSON.parse(JSON.stringify(new Set(['old']))));
    const { result } = await renderHook(() => useDismissedOffers('u1'), { wrapper: wrapper(qc) });

    expect(typeof result.current.keys.has).toBe('function');
    expect(result.current.keys.size).toBe(0);
  });
});
