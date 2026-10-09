// 02.2-23 Task 1 (ACT-15, D-16): add a month is one RPC with a server-recorded monthAdded step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerAddMonthMutations, useAddMonth } from '../addMonth';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const input = { householdId: 'h1', ownerId: 'u1', today: '2026-10-09', horizonMonth: null, monthLabel: 'December 2026' };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerAddMonthMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockUuid = 0;
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('useAddMonth', () => {
  it('calls add_activity_month for the addable month with a monthAdded step and shows the Undo toast', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'applied', month: '2026-12', inserted: [], undo_step_id: 'x' }, error: null, status: 200 });
    const qc = newClient();
    qc.setQueryData(queryKeys.householdHorizon('h1'), '2026-11');
    const { result } = await renderHook(() => useAddMonth(), { wrapper: wrapper(qc) });

    const stepId = result.current.add({ ...input, horizonMonth: '2026-11' });

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const rpc = fake.calls.find((c) => c.method === 'rpc');
    expect(rpc?.args[0]).toBe('add_activity_month');
    const args = rpc?.args[1] as { p_month: string; p_household_id: string; p_undo_step: unknown };
    expect(args.p_month).toBe('2026-12');
    expect(args.p_household_id).toBe('h1');
    expect(args.p_undo_step).toEqual({ id: stepId, label_key: 'monthAdded', label_params: { name: 'December 2026' } });
    expect(getToast()?.stepId).toBe(stepId);
    expect(qc.getQueryData(queryKeys.householdHorizon('h1'))).toBe('2026-12');
  });

  it('throws RangeError before any write when no month is addable', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const { result } = await renderHook(() => useAddMonth(), { wrapper: wrapper(newClient()) });
    expect(() => result.current.add({ ...input, horizonMonth: '2027-10' })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('treats already-applied as success', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useAddMonth(), { wrapper: wrapper(qc) });
    result.current.add(input);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('rolls back the horizon and shows a refusal on a MonthNotAddableError (22023)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'too far', code: '22023' }, status: 400 });
    const qc = newClient();
    qc.setQueryData(queryKeys.householdHorizon('h1'), '2026-11');
    const { result } = await renderHook(() => useAddMonth(), { wrapper: wrapper(qc) });
    result.current.add({ ...input, horizonMonth: '2026-11' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData(queryKeys.householdHorizon('h1'))).toBe('2026-11');
    expect(getToast()?.kind).toBe('refusal');
    expect((recordFailedWrite.mock.calls[0]?.[0] as { attempted: unknown }).attempted).toEqual({ month: '2026-12' });
  });
});
