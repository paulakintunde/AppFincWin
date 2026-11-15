// 06.1-73 (DB-1 / H-11b): the write-storm guard. One Decide check write and one record write, through the real mutation
// defaults (fake Supabase), against a cache seeded like a real account (160+ queries), with the app's persist subscription
// (startThrottledPersist). The emulator measurement behind this plan found the persister dehydrating the whole client on
// every cache event (54 dehydrates for 2 saves across one Decide check); this test fails if that comes back, if a write
// fans out into more cache events than the budget, if any query fetches twice, or if anything keeps working once idle.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useAddTransaction } from '@/data/mutations/transactions';
import { clearVersionChains } from '@/data/sync/versionChain';
import type { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import { createEncryptedPersister, persistOptions, QUERY_CACHE_KEY, startThrottledPersist } from '../cache/persister';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: jest.fn(() => 'UTC') }));
jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
  dismissFailedWrite: jest.fn(async () => undefined),
}));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, dehydrate: jest.fn(actual.dehydrate) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dehydrate: dehydrateSpy } = require('@tanstack/react-query') as { dehydrate: jest.Mock };

/**
 * The most query-cache events (added, removed, updated) one Decide check write plus one record write may cause in this
 * seeded cache. Measured after the 06.1-73 fixes: 8 (the optimistic patches, the settled rows, the invalidation of the one
 * mounted derived read and its single refetch). The budget leaves room for one more patch per write, not for a refetch wave.
 */
const WRITE_EVENT_BUDGET = 10;
const THROTTLE_MS = 200;
const HH = 'hh-1';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: jest.fn(async (k: string) => map.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      map.delete(k);
    }),
  };
}

const checkRow = (id: string): DecideCheckRow => ({
  id,
  household_id: HH,
  created_by: 'user-1',
  kind: 'buy',
  name: 'Desk lamp',
  inputs: { kind: 'buy' },
  status: 'open',
  furthest_step: 1,
  last_seen_state: null,
  last_seen_basis: null,
  answer_v3: null,
  reopened_from: null,
  decided_at: null,
  verdict_at_decision: null,
  estimate_day_one: null,
  estimate_monthly: null,
  wait_monthly: null,
  ready_by: null,
  broke_line: false,
  cooling_off_at: null,
  estimate_monthly_payment: null,
  estimate_running: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
});

/** A cache shaped like a real account: 120 transaction months, the Decide reads and the rest. */
function seed(qc: QueryClient): void {
  for (let y = 2017; y < 2027; y++) {
    for (let m = 1; m <= 12; m++) qc.setQueryData(queryKeys.transactionsMonth(HH, `${y}-${String(m).padStart(2, '0')}`), []);
  }
  qc.setQueryData(queryKeys.decideChecks('user-1', HH), []);
  qc.setQueryData(queryKeys.savingsGoals('user-1', HH), []);
  qc.setQueryData(queryKeys.debts(HH), []);
  qc.setQueryData(queryKeys.accountBalances(HH), []);
  for (let i = 0; i < 40; i++) qc.setQueryData(['decide-inputs', HH, i], { i });
}

describe('06.1-73 write settle budget', () => {
  afterEach(() => {
    jest.useRealTimers();
    dehydrateSpy.mockClear();
  });

  it('one Decide write and one record write stay inside the event budget, fetch nothing twice and dehydrate once per save', async () => {
    mockUuid = 0;
    clearVersionChains();
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: Infinity } } });
    registerMutationDefaults(qc);
    seed(qc);
    expect(qc.getQueryCache().getAll().length).toBeGreaterThanOrEqual(150);

    // One mounted read that a record write invalidates: it may refetch once, never more.
    const balances = new QueryObserver(qc, { queryKey: queryKeys.accountBalances(HH), queryFn: async () => [] });
    const offBalances = balances.subscribe(() => undefined);

    const storage = fakeStorage();
    const persister = createEncryptedPersister(storage as unknown as LargeSecureStore, THROTTLE_MS);
    const stopPersist = startThrottledPersist(qc, persister, persistOptions);

    let events = 0;
    const fetchesByHash = new Map<string, number>();
    const offEvents = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'added' || e.type === 'removed' || e.type === 'updated') events++;
      if (e.type === 'updated' && e.action.type === 'fetch') fetchesByHash.set(e.query.queryHash, (fetchesByHash.get(e.query.queryHash) ?? 0) + 1);
    });

    fake.respondWith({ data: checkRow('id-1'), error: null, status: 200 });
    const checkHook = await renderHook(() => useCreateCheck(), { wrapper: wrapper(qc) });
    checkHook.result.current.create({ userId: 'user-1', id: 'id-1', householdId: HH, kind: 'buy', name: 'Desk lamp', inputs: { kind: 'buy' }, furthestStep: 1 });
    await waitFor(() => expect(qc.getMutationCache().getAll().every((m) => m.state.status !== 'pending')).toBe(true));

    const addHook = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });
    fake.respondWith({ data: null, error: null, status: 201 });
    addHook.result.current.add({
      householdId: HH,
      accountId: 'acc1',
      amount: 2500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-11-13',
      timeZone: 'UTC',
    });
    await waitFor(() => expect(qc.getMutationCache().getAll().every((m) => m.state.status !== 'pending')).toBe(true));
    await waitFor(() => expect(qc.getQueryState(queryKeys.accountBalances(HH))?.fetchStatus).toBe('idle'));
    await persister.flush();
    await new Promise((r) => setTimeout(r, THROTTLE_MS + 50));
    await persister.flush();

    const saves = storage.setItem.mock.calls.filter(([k]) => k === QUERY_CACHE_KEY).length;
    expect(events).toBeGreaterThan(0);
    expect(events).toBeLessThanOrEqual(WRITE_EVENT_BUDGET);
    for (const n of fetchesByHash.values()) expect(n).toBeLessThanOrEqual(1);
    // One dehydrate per save, never one per cache event.
    expect(saves).toBeGreaterThan(0);
    expect(dehydrateSpy.mock.calls.length).toBe(saves);
    expect(dehydrateSpy.mock.calls.length).toBeLessThan(events);

    // Idle: a minute with no cache events runs no save and changes nothing in the cache.
    jest.useFakeTimers();
    const savesBefore = storage.setItem.mock.calls.length;
    const eventsBefore = events;
    jest.advanceTimersByTime(60_000);
    expect(storage.setItem.mock.calls.length).toBe(savesBefore);
    expect(events).toBe(eventsBefore);

    offEvents();
    stopPersist();
    offBalances();
    checkHook.unmount();
    addHook.unmount();
  });
});
