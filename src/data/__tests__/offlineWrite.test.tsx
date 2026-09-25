// Task 3: the SYN-02 proof. Offline writes queue, survive a restart, flush in order on
// reconnect with their original client-generated UUIDs (MON-08), and trigger the rate
// follow-up when needed -- all driven through the real setMutationDefaults registrations,
// not a simplified stand-in. Uses a plain in-memory persister (throttleTime 0), not the
// encrypted LargeSecureStore-backed one, since SYN-07 (the encryption itself) is already
// proven in src/data/__tests__/persister.test.ts and src/data/__tests__/offlineRead.test.tsx.
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { registerMutationDefaults } from '@/data/mutations';
import { useAddTransaction, useEditTransaction } from '@/data/mutations/transactions';
import { clearVersionChains } from '@/data/sync/versionChain';

let mockActiveClient: unknown;
let mockUuidCounter = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${mockUuidCounter++}`),
}));

jest.mock('@/services/locale/deviceLocale', () => ({
  getDeviceTimeZone: jest.fn(() => 'UTC'),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

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

/** A minimal AsyncStorage-shaped in-memory store, shared across two persister instances to
 * simulate "the app restarted" (fresh QueryClient, same underlying disk). */
function memoryStorage(backing: Map<string, string> = new Map()) {
  return {
    getItem: async (key: string) => backing.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: async (key: string) => {
      backing.delete(key);
    },
  };
}

const serverTransaction = (overrides: Partial<TransactionRow> = {}): TransactionRow => ({
  id: 'uuid-0',
  household_id: 'h1',
  account_id: 'acc1',
  created_by: 'user-1',
  original_amount: 500,
  original_currency: 'USD',
  home_currency: 'USD',
  home_amount: 500,
  rate: '1.0000000000',
  orig_per_eur: null,
  home_per_eur: null,
  rate_date: null,
  rate_source: 'same-currency',
  rate_pending: false,
  local_date: '2026-09-24',
  time_zone: 'UTC',
  note: null,
  version: 1,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  mockUuidCounter = 0;
  onlineManager.setOnline(true);
  recordFailedWrite.mockClear();
  clearVersionChains();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('offline write queue (SYN-02)', () => {
  it('an offline add applies the optimistic row, never calls insert, and pauses the mutation', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => {
      const rows = qc.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.id).toBe('uuid-0');
    });

    const rows = qc.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows?.[0]).toMatchObject({ id: 'uuid-0', pending: true });

    expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);

    await waitFor(() => {
      const mutation = qc.getMutationCache().getAll()[0];
      expect(mutation?.state.isPaused).toBe(true);
    });
  });

  it('ordering: an offline add then edit of the same row flush in original order on reconnect', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const addHook = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });
    const editHook = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    const id = addHook.result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    editHook.result.current.edit({
      id,
      householdId: 'h1',
      month: '2026-09',
      expectedVersion: 1,
      patch: { note: 'reconciled' },
      homeCurrency: 'USD',
    });

    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(2));
    await waitFor(() => {
      expect(qc.getMutationCache().getAll().every((m) => m.state.isPaused)).toBe(true);
    });

    fake.respondWith({ data: serverTransaction({ id }), error: null, status: 201 });
    fake.respondWith({ data: [serverTransaction({ id, note: 'reconciled', version: 2 })], error: null, status: 200 });

    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    const writeCalls = fake.calls.filter((c) => c.method === 'insert' || c.method === 'update');
    expect(writeCalls.map((c) => c.method)).toEqual(['insert', 'update']);

    const updateCall = fake.calls.find((c) => c.method === 'eq' && c.args[0] === 'version');
    expect(updateCall?.args).toEqual(['version', 1]);
  });

  it('CR-A02: two queued edits to the same row both apply -- the second chains onto the first one\'s new version', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-1', version: 1 })]);
    const editHook = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    // Both edits read expectedVersion from the same cached row (still version 1).
    for (const note of ['first', 'second']) {
      const cached = qc.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      editHook.result.current.edit({
        id: 'tx-1',
        householdId: 'h1',
        month: '2026-09',
        expectedVersion: cached?.[0]?.version ?? 0,
        patch: { note },
        homeCurrency: 'USD',
      });
    }

    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(2));
    await waitFor(() => {
      expect(qc.getMutationCache().getAll().every((m) => m.state.isPaused)).toBe(true);
    });

    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', note: 'first', version: 2 })], error: null, status: 200 });
    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', note: 'second', version: 3 })], error: null, status: 200 });

    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    const versionFilters = fake.calls.filter((c) => c.method === 'eq' && c.args[0] === 'version').map((c) => c.args[1]);
    expect(versionFilters).toEqual([1, 2]);
    expect(recordFailedWrite).not.toHaveBeenCalled();

    await waitFor(() => {
      const rows = qc.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]).toMatchObject({ note: 'second', version: 3 });
    });
  });

  it('CR-A02: a genuine edit from another device still conflicts (the chain only follows this device\'s writes)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-9', version: 1 })]);
    const editHook = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    fake.respondWith({ data: [], error: null, status: 200 }); // zero rows: server is at version 5
    fake.respondWith({ data: serverTransaction({ id: 'tx-9', note: 'other device', version: 5 }), error: null, status: 200 });

    editHook.result.current.edit({
      id: 'tx-9',
      householdId: 'h1',
      month: '2026-09',
      expectedVersion: 1,
      patch: { note: 'mine' },
      homeCurrency: 'USD',
    });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict' })));
  });

  it('restart: an offline add survives dehydrate/rehydrate into a brand-new QueryClient and still flushes with the same UUID', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    const id = result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => {
      const mutation = qc.getMutationCache().getAll()[0];
      expect(mutation?.state.isPaused).toBe(true);
    });

    const backing = new Map<string, string>();
    const persister = createAsyncStoragePersister({ storage: memoryStorage(backing), key: 'test-cache', throttleTime: 0 });

    await persistQueryClientSave({
      queryClient: qc,
      persister,
      buster: 'test',
      dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused },
    });

    // Simulate "the app restarted": a brand-new QueryClient, registered with real mutation
    // defaults BEFORE restoring (Pitfall 3) -- otherwise the resumed mutation has no function
    // to call.
    const restartedClient = newClient();
    await persistQueryClientRestore({ queryClient: restartedClient, persister, buster: 'test' });

    fake.respondWith({ data: serverTransaction({ id }), error: null, status: 201 });

    onlineManager.setOnline(true);
    await restartedClient.resumePausedMutations();

    const insertCall = fake.calls.find((c) => c.method === 'insert');
    expect((insertCall?.args[0] as { id: string }).id).toBe(id);

    await waitFor(() => {
      const rows = restartedClient.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.pending).toBeUndefined();
    });
  });

  it('a write that comes back rate_pending triggers resolve-rate exactly once after the queued flush', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    qc.setQueryData(queryKeys.fxLatest(), [
      { quote: 'USD', rate: '1.1483000000', rate_date: '2026-09-21', source: 'frankfurter-v2' },
      { quote: 'JPY', rate: '180.7000000000', rate_date: '2026-09-21', source: 'frankfurter-v2' },
    ]);
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    const id = result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 1000 as never,
      currency: 'JPY',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => {
      const mutation = qc.getMutationCache().getAll()[0];
      expect(mutation?.state.isPaused).toBe(true);
    });

    fake.respondWith({
      data: serverTransaction({ id, original_currency: 'JPY', original_amount: 1000, rate_pending: true }),
      error: null,
      status: 201,
    });
    fake.respondWith({
      data: { row: serverTransaction({ id, original_currency: 'JPY', original_amount: 1000, rate_pending: false }) },
      error: null,
      status: 200,
    });

    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    const invokeCalls = fake.calls.filter((c) => c.method === 'functions.invoke');
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]?.args).toEqual(['resolve-rate', { body: { transactionId: id } }]);
  });

  it('status: after the flush, no mutation is left in a pending (queued) state', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    const id = result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => {
      const mutation = qc.getMutationCache().getAll()[0];
      expect(mutation?.state.isPaused).toBe(true);
    });

    fake.respondWith({ data: serverTransaction({ id }), error: null, status: 201 });

    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    await waitFor(() => {
      const queued = qc.getMutationCache().getAll().filter((m) => m.state.status === 'pending');
      expect(queued).toHaveLength(0);
    });
  });
});

