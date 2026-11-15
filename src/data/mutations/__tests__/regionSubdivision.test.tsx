// 06.1-71 (OQ-71-1 B): You > Region's state or province write. Optimistic on the same cache entry Decide's inputs read, rolled
// back with a failed-write record when the server rejects it; the read hook shares the key.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '../index';
import { useSetRegionSubdivision } from '../regionSubdivision';
import { useRegionSubdivision } from '@/data/queries/regionSubdivision';
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

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return qc;
}
const key = queryKeys.regionSubdivision('user-1');

beforeEach(() => {
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
});

describe('useSetRegionSubdivision', () => {
  it('sets the cache at once and sends exactly { region_subdivision }', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 204 });
    const qc = newClient();
    qc.setQueryData(key, null);
    const { result } = await renderHook(() => useSetRegionSubdivision('user-1'), { wrapper: wrapper(qc) });

    result.current('ON');

    await waitFor(() => expect(qc.getQueryData(key)).toBe('ON'));
    await waitFor(() => expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ region_subdivision: 'ON' }));
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['id', 'user-1']]);
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('on a rejection puts the previous value back and records a failed write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });
    const qc = newClient();
    qc.setQueryData(key, 'TX');
    const { result } = await renderHook(() => useSetRegionSubdivision('user-1'), { wrapper: wrapper(qc) });

    result.current('NY');

    await waitFor(() =>
      expect(recordFailedWrite).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'profiles', entityId: 'user-1', kind: 'rejected', attempted: { region_subdivision: 'NY' } })
      )
    );
    expect(qc.getQueryData(key)).toBe('TX');
  });

  it('on a rejection with nothing cached before, reads the value again', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });
    const qc = newClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSetRegionSubdivision('user-1'), { wrapper: wrapper(qc) });

    result.current(null);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });

  it('a network failure is not a rejection: nothing is recorded or rolled back', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    qc.setQueryData(key, 'TX');
    const { result } = await renderHook(() => useSetRegionSubdivision('user-1'), { wrapper: wrapper(qc) });

    result.current('NY');

    await waitFor(() => expect(qc.getQueryData(key)).toBe('NY'));
    expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('useRegionSubdivision', () => {
  it('reads the stored value under the shared key', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { region_subdivision: 'BC' }, error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useRegionSubdivision('user-1'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe('BC'));
  });

  it('is null with no user (the read never runs)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useRegionSubdivision(undefined), { wrapper: wrapper(qc) });
    expect(result.current).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });
});
