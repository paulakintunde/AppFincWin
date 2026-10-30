// 05.3-13 (T-05.3-13-01): useRecordBought mints ids once, ignores a pending duplicate, replays safely.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerRecordBoughtMutations, useRecordBought, type BoughtContext } from '../boughtWrite';
import type { Purchase, Result } from '@/engine/decide/v3';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;
const mockTrack = jest.fn();

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const CHECKS = queryKeys.decideChecks('u1', 'h1');

const check = { id: 'chk1', created_by: 'u1', household_id: 'h1', name: 'Sofa', inputs: {}, status: 'open', version: 1 } as unknown as DecideCheckRow;
const ctx: BoughtContext = {
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: '2026-10-18',
  cashAccountId: 'cash1',
  debtCategoryId: null,
  runningCostCategoryId: null,
  name: 'Sofa',
};
const purchase = {
  dayOne: 100000,
  monthly: 0,
  runningMonthly: 0,
  schedule: null,
  share: { weights: [1], myIndex: 0 },
  financed: false,
  secured: false,
  categoryId: null,
} as unknown as Purchase;
const result = { legacyState: 'fits', facts: [] } as unknown as Result;

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerRecordBoughtMutations(qc);
  qc.setQueryData(CHECKS, [check]);
  return qc;
}
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  return fake;
}
const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');

beforeEach(() => {
  mockUuid = 0;
  mockTrack.mockClear();
  onlineManager.setOnline(true);
});

describe('useRecordBought', () => {
  it('sends one record_decide_go call and tracks decide_recorded once', async () => {
    const fake = setup();
    fake.respondWith(ok({ status: 'applied' }));
    const { result: hook } = await renderHook(() => useRecordBought(), { wrapper: wrapper(newClient()) });
    const out = hook.current.record({ check, purchase, result, ctx });
    expect(out?.stepId).toBeTruthy();
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(mockTrack).toHaveBeenCalledWith('decide_recorded', { outcome: 'bought' });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap while one is pending (offline)', async () => {
    setup();
    onlineManager.setOnline(false);
    const { result: hook } = await renderHook(() => useRecordBought(), { wrapper: wrapper(newClient()) });
    expect(hook.current.record({ check, purchase, result, ctx })).not.toBeNull();
    expect(hook.current.record({ check, purchase, result, ctx })).toBeNull();
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('a refusal sends nothing and returns null', async () => {
    const fake = setup();
    const { result: hook } = await renderHook(() => useRecordBought(), { wrapper: wrapper(newClient()) });
    expect(hook.current.record({ check, purchase, result, ctx: { ...ctx, cashAccountId: null } })).toBeNull();
    expect(rpcCalls(fake)).toHaveLength(0);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('canRecord is false on a refusal and true otherwise', async () => {
    setup();
    const { result: hook } = await renderHook(() => useRecordBought(), { wrapper: wrapper(newClient()) });
    expect(hook.current.canRecord({ purchase, result, ctx })).toBe(true);
    expect(hook.current.canRecord({ purchase: null, result, ctx })).toBe(false);
  });
});
