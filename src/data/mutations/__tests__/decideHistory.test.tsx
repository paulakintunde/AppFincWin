// 06.1-12 (CO-D-64 (6)): one history row per decision with the JSON-safe Result; read per check.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckHistoryRow } from '@/db/decideCheckHistory';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerDecideHistoryMutations, useRecordCheckHistory } from '../decideHistory';
import { useCheckHistory } from '../../queries/decideHistory';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'hist-1') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideHistoryMutations(qc);
  return { fake, qc };
}
const row = (over: Partial<DecideCheckHistoryRow> = {}): DecideCheckHistoryRow => ({
  id: 'h0',
  check_id: 'c1',
  created_by: 'u1',
  said_on: '2026-11-11',
  code: 'fits_unspent',
  variant: null,
  result: {},
  created_at: '2026-11-11T09:00:00Z',
  ...over,
});

beforeEach(() => {
  onlineManager.setOnline(true);
  recordFailedWrite.mockClear();
});

describe('useRecordCheckHistory', () => {
  it('inserts the grant keys only, with the local day and a JSON-safe result', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ id: 'hist-1' })));
    const { result } = await renderHook(() => useRecordCheckHistory('u1'), { wrapper: wrapper(qc) });
    const wrote = result.current.mutate({ checkId: 'c1', result: { code: 'fits_unspent', variant: null }, now: new Date(2026, 10, 11, 23, 30) });
    expect(wrote).toBe(true);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    expect(fake.calls.find((c) => c.method === 'insert')?.table).toBe('decide_check_history');
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'hist-1',
      check_id: 'c1',
      said_on: '2026-11-11',
      code: 'fits_unspent',
      variant: null,
      result: { code: 'fits_unspent', variant: null },
    });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('skips a row when the same day, code and variant is already known; a different code writes; default clock is used', async () => {
    const { fake, qc } = setup();
    const now = new Date(2026, 10, 11, 12);
    qc.setQueryData(queryKeys.decideCheckHistory('u1', 'c1'), [row()]);
    fake.respondWith(ok(row({ id: 'hist-1', code: 'not_yet' })));
    fake.respondWith(ok(row({ id: 'hist-1', code: 'fits_unspent' })));
    const { result } = await renderHook(() => useRecordCheckHistory('u1'), { wrapper: wrapper(qc) });
    expect(result.current.mutate({ checkId: 'c1', result: { code: 'fits_unspent' }, now })).toBe(false);
    expect(fake.calls).toHaveLength(0);
    expect(result.current.mutate({ checkId: 'c1', result: { code: 'not_yet' }, now })).toBe(true);
    expect(result.current.mutate({ checkId: 'c1', result: { code: 'other', variant: 'v' } })).toBe(true);
    await waitFor(() => expect(qc.isMutating()).toBe(0));
  });

  it('refuses a result that holds a bigint', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useRecordCheckHistory('u1'), { wrapper: wrapper(qc) });
    expect(() => result.current.mutate({ checkId: 'c1', result: { code: 'x', price: BigInt(5) } as never })).toThrow(TypeError);
  });

  it('a rejected write is parked with field names only, never the result', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useRecordCheckHistory('u1'), { wrapper: wrapper(qc) });
    result.current.mutate({ checkId: 'c1', result: { code: 'fits_unspent', secret: 123456 } as never });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const rec = recordFailedWrite.mock.calls[0]![0];
    expect(rec.entity).toBe('decide_check_history');
    expect(JSON.stringify(rec)).not.toContain('123456');
  });
});

describe('useCheckHistory', () => {
  it('lists rows for the check newest first', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([row({ id: 'h2' }), row({ id: 'h1', said_on: '2026-11-10' })]));
    const { result } = await renderHook(() => useCheckHistory('u1', 'c1'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.map((r) => r.id)).toEqual(['h2', 'h1']));
  });

  it('is off without a check', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useCheckHistory('u1', undefined), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });
});
