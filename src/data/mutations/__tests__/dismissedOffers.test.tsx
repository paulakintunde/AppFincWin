// 02.2-23 Task 2 (ACT-11, D-18): "Not now" is stored on the server and hides offers at once.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerDismissOffersMutations, useDismissOffers } from '../dismissedOffers';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDismissOffersMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => recordFailedWrite.mockClear());

describe('useDismissOffers', () => {
  it('adds the keys to the cache at once and upserts them with ignoreDuplicates', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });
    const qc = newClient();
    qc.setQueryData(queryKeys.dismissedOffers('u1'), new Set(['old']));
    const { result } = await renderHook(() => useDismissOffers('u1'), { wrapper: wrapper(qc) });

    result.current.dismiss(['k1', 'k2']);

    await waitFor(() =>
      expect([...(qc.getQueryData(queryKeys.dismissedOffers('u1')) as Set<string>)].sort()).toEqual(['k1', 'k2', 'old'])
    );
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    const upsert = fake.calls.find((c) => c.method === 'upsert');
    expect(upsert?.table).toBe('dismissed_series_offers');
    expect(upsert?.args[0]).toEqual([{ offer_key: 'k1' }, { offer_key: 'k2' }]);
    expect(upsert?.args[1]).toMatchObject({ ignoreDuplicates: true });
  });

  it('refuses an empty or oversized batch before any write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const { result } = await renderHook(() => useDismissOffers('u1'), { wrapper: wrapper(newClient()) });
    expect(() => result.current.dismiss([])).toThrow(RangeError);
    expect(() => result.current.dismiss(Array.from({ length: 51 }, (_, i) => `k${i}`))).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('restores the cache and records a count-only failed write when rejected', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    qc.setQueryData(queryKeys.dismissedOffers('u1'), new Set(['old']));
    const { result } = await renderHook(() => useDismissOffers('u1'), { wrapper: wrapper(qc) });

    result.current.dismiss(['secret-merchant|GBP|-']);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect([...(qc.getQueryData(queryKeys.dismissedOffers('u1')) as Set<string>)]).toEqual(['old']);
    expect((recordFailedWrite.mock.calls[0]?.[0] as { attempted: unknown }).attempted).toEqual({ count: 1 });
  });
});
