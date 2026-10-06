// Task 2 (RED): setMutationDefaults-backed transaction/account mutations -- client UUIDs
// before mutate() (MON-08), optimistic pending rows, the resolve-rate follow-up, and D-18/
// D-19 conflict/rejection handling. '@/services/supabase' is mocked to a mutable client so
// each test controls exactly what the (lazily required) write function talks to.
//
// react-native-get-random-values (imported transitively) falls back to a native module that
// doesn't exist under Jest; Babel hoists imports above other top-level code, so this exists
// as defense in depth (mirrors src/data/sync/__tests__/failedWrites.test.ts).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient, NewTransaction, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { MAX_SERVER_ERROR_RETRIES } from '@/data/sync/writeErrors';
import { clearVersionChains } from '@/data/sync/versionChain';
import { noteResolveRateThrottled, resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { registerMutationDefaults } from '../index';
import {
  useAddTransaction,
  useDeleteTransaction,
  useEditTransaction,
  useImportChunks,
  useMarkPaid,
  useSkipOccurrence,
  type AddTransactionVars,
} from '../transactions';
import { useAddAccount, useEditAccount } from '../accounts';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

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

const USD_RATE = { quote: 'USD', rate: '1.1483000000', rate_date: '2026-09-21', source: 'frankfurter-v2' as const };
const JPY_RATE = { quote: 'JPY', rate: '180.7000000000', rate_date: '2026-09-21', source: 'frankfurter-v2' as const };

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
  orig_custom_unit_value: null,
  orig_custom_ref_per_eur: null,
  home_custom_unit_value: null,
  home_custom_ref_per_eur: null,
  rate_date: null,
  rate_source: 'same-currency',
  rate_pending: false,
  local_date: '2026-09-24',
  time_zone: 'UTC',
  note: null,
  name: null,
  category_id: null,
  payment_type: null,
  status: 'paid',
  deleted_at: null,
  import_batch_id: null,
  recurring_series_id: null,
  occurrence_date: null,
  updated_by: null,
  raw_amount: null,
  raw_balance: null,
  external_id: null,
  import_format: null,
  transfer_id: null,
  version: 1,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  mockUuidCounter = 0;
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
  clearVersionChains();
  resetResolveRateBackoffForTests(); // RD-05
});

describe('useAddTransaction', () => {
  it('generates a client UUID, applies an optimistic pending row, and sends exactly the 8 granted keys', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    let id = '';
    id = result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    expect(id).toBe('uuid-0');

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.id).toBe('uuid-0');
    });

    const insertCall = fake.calls.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual({
      id: 'uuid-0',
      household_id: 'h1',
      account_id: 'acc1',
      original_amount: 500,
      original_currency: 'USD',
      local_date: '2026-09-24',
      time_zone: 'UTC',
      note: null,
    });
  });

  it('defaults localDate/timeZone via getDeviceTimeZone and derives the month from it', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
    });

    await waitFor(() => {
      const insertCall = fake.calls.find((c) => c.method === 'insert');
      expect(insertCall).toBeDefined();
    });

    const insertCall = fake.calls.find((c) => c.method === 'insert');
    const row = insertCall?.args[0] as { local_date: string; time_zone: string };
    expect(row.time_zone).toBe('UTC');
    expect(row.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('onSuccess replaces the optimistic row with the server row and calls resolve-rate once when rate_pending', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const pendingRow = serverTransaction({
      original_currency: 'JPY',
      original_amount: 1000,
      home_amount: null,
      rate: null,
      rate_pending: true,
    });
    const resolvedRow = serverTransaction({
      original_currency: 'JPY',
      original_amount: 1000,
      home_amount: 635,
      rate: '0.0063547316',
      rate_pending: false,
    });
    fake.respondWith({ data: pendingRow, error: null, status: 201 });
    fake.respondWith({ data: { row: resolvedRow }, error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.fxLatest(), [USD_RATE, JPY_RATE]);
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
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
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.rate_pending).toBe(false);
    });

    const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows?.[0]?.home_amount).toBe(635);
    expect(rows?.[0]).not.toHaveProperty('pending', true);
    expect(fake.calls.filter((c) => c.method === 'functions.invoke')).toHaveLength(1);
  });

  it('RD-05: skips the resolve-rate follow-up entirely while the client-side throttle backoff is active', async () => {
    noteResolveRateThrottled(); // simulates a very recent 429 from resolve-rate
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const pendingRow = serverTransaction({
      original_currency: 'JPY',
      original_amount: 1000,
      home_amount: null,
      rate: null,
      rate_pending: true,
    });
    fake.respondWith({ data: pendingRow, error: null, status: 201 });
    // Only one response is queued (the insert) -- if the follow-up called functions.invoke
    // anyway, fakeSupabase.next() would run out of responses and throw.

    const qc = newClient();
    qc.setQueryData(queryKeys.fxLatest(), [USD_RATE, JPY_RATE]);
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
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
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.rate_pending).toBe(true);
    });

    expect(fake.calls.filter((c) => c.method === 'functions.invoke')).toHaveLength(0);
  });

  // C-WR-03: a one-row list for a month that was never loaded would pass for the whole month
  // (status success, fresh dataUpdatedAt) and show wrong totals, offline indefinitely.
  it('C-WR-03: a backdated add into a month never loaded does not fabricate that month, and invalidates it instead', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const pendingRow = serverTransaction({ local_date: '2026-03-14', original_currency: 'JPY', rate_pending: true });
    fake.respondWith({ data: pendingRow, error: null, status: 201 });
    fake.respondWith({ data: { row: { ...pendingRow, rate_pending: false } }, error: null, status: 200 }); // resolve-rate

    const qc = newClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'JPY',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-03-14',
      timeZone: 'UTC',
    });

    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'functions.invoke')).toHaveLength(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsMonth('h1', '2026-03') })
    );
    expect(qc.getQueryData(queryKeys.transactionsMonth('h1', '2026-03'))).toBeUndefined();
  });

  it('add rejected with a permanent DbError removes the optimistic row and records a failed write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'check violation', code: '23514' }, status: 400 });

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
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows ?? []).toHaveLength(0);
    });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'transactions', kind: 'rejected', code: '23514' })
    );
  });

  it('CR-A01: a real postgrest-js network failure (status 0, code "") keeps the row and retries, never parks it as failed', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    // The exact shape postgrest-js 2.x resolves when fetch itself rejects.
    fake.respondWith({ data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 });
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
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

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.failureCount).toBe(1));
    const mutation = qc.getMutationCache().getAll()[0];
    expect(mutation?.state.status).toBe('pending');
    const rows = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows?.[0]).toMatchObject({ id: 'uuid-0', pending: true });
    expect(recordFailedWrite).not.toHaveBeenCalled();

    // The retry (after writeRetryDelay's backoff) lands the write.
    await waitFor(
      () => {
        const settled = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(
          queryKeys.transactionsMonth('h1', '2026-09')
        );
        expect(settled?.[0]?.pending).toBeUndefined();
      },
      { timeout: 5000 }
    );
    expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(2);
    expect(recordFailedWrite).not.toHaveBeenCalled();
  }, 10_000);

  it('WR-A01: with no usable session the write is held (never sent under the anon key) and lands once the session is back', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.session = null; // token expired and the refresh failed
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
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

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.failureCount).toBe(1));
    expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);
    expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('pending');
    expect(recordFailedWrite).not.toHaveBeenCalled();

    fake.session = { access_token: 'refreshed' };
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  }, 10_000);

  it('WR-A01: a 401 JWT-expired response is retried, not rolled back into the failed list', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'JWT expired', code: 'PGRST303' }, status: 401 });
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
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

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.failureCount).toBe(1));
    expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('pending');
    const rows = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows?.[0]).toMatchObject({ id: 'uuid-0', pending: true });
    expect(recordFailedWrite).not.toHaveBeenCalled();

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'), { timeout: 5000 });
    expect(recordFailedWrite).not.toHaveBeenCalled();
  }, 10_000);

  it('WR-A02: a write that always gets a 5xx is retried a bounded number of times, then parked as failed so the queue moves on', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    for (let i = 0; i <= MAX_SERVER_ERROR_RETRIES; i++) {
      fake.respondWith({ data: null, error: { message: 'trigger raised', code: 'XX000' }, status: 500 });
    }

    const qc = newClient();
    const vars: AddTransactionVars = {
      row: {
        id: 'tx-500',
        household_id: 'h1',
        account_id: 'acc1',
        original_amount: 500,
        original_currency: 'USD',
        local_date: '2026-09-24',
        time_zone: 'UTC',
        note: null,
      },
      optimistic: { homeCurrency: 'USD', createdBy: 'user-1', month: '2026-09' },
    };
    // Same registered defaults, with the backoff removed so the test does not wait minutes.
    const mutation = qc.getMutationCache().build(qc, { mutationKey: mutationKeys.addTransaction, retryDelay: 0 });
    await expect(mutation.execute(vars)).rejects.toMatchObject({ status: 500 });

    expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(MAX_SERVER_ERROR_RETRIES + 1);
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'transactions', entityId: 'tx-500', kind: 'rejected', code: 'retry-exhausted' })
    );
    const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows ?? []).toHaveLength(0);
  });

  it('WR-A03: a malformed cached rate cannot abort the write -- the insert is still sent with a pending stamp', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction({ original_currency: 'JPY', rate_pending: true }), error: null, status: 201 });
    fake.respondWith({ data: null, error: null, status: 200 }); // resolve-rate follow-up

    const qc = newClient();
    qc.setQueryData(queryKeys.fxLatest(), [USD_RATE, { ...JPY_RATE, rate: 'not-a-rate' }]);
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 1000 as never,
      currency: 'JPY',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('a duplicate-id (23505) insert is treated as success via the fetch-existing path, no rollback', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    fake.respondWith({ data: serverTransaction(), error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // the month on screen (C-WR-03)
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
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.id).toBe('uuid-0');
    });

    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('useEditTransaction', () => {
  it('applies an optimistic pending patch and recomputes a provisional stamp on a foreign amount change', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const original = serverTransaction({ id: 'tx-1', original_currency: 'JPY', original_amount: 500, home_amount: 3 });
    fake.respondWith({
      data: [serverTransaction({ id: 'tx-1', original_currency: 'JPY', original_amount: 1000, home_amount: 635, rate_pending: false })],
      error: null,
      status: 200,
    });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [original]);
    qc.setQueryData(queryKeys.fxLatest(), [USD_RATE, JPY_RATE]);
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit({
      id: 'tx-1',
      householdId: 'h1',
      month: '2026-09',
      expectedVersion: 1,
      patch: { original_amount: 1000 },
      homeCurrency: 'USD',
    });

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.home_amount).toBe(635);
    });

    const updateCall = fake.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ original_amount: 1000 });
  });

  it('WR-A05: moving a transaction\'s date into another month moves it between the month caches', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const sep = queryKeys.transactionsMonth('h1', '2026-09');
    const oct = queryKeys.transactionsMonth('h1', '2026-10');
    qc.setQueryData(sep, [serverTransaction({ id: 'tx-1', local_date: '2026-09-24' })]);
    qc.setQueryData(oct, [serverTransaction({ id: 'tx-oct', local_date: '2026-10-05' })]);
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit({
      id: 'tx-1',
      householdId: 'h1',
      month: '2026-09',
      expectedVersion: 1,
      patch: { local_date: '2026-10-02' },
      homeCurrency: 'USD',
    });

    await waitFor(() => {
      expect(qc.getQueryData<TransactionRow[]>(sep)?.map((r) => r.id)).toEqual([]);
      expect(qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(oct)?.find((r) => r.id === 'tx-1')).toMatchObject({
        local_date: '2026-10-02',
        pending: true,
      });
    });

    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', local_date: '2026-10-02', version: 2 })], error: null, status: 200 });
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    await waitFor(() => {
      const octRows = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(oct);
      expect(octRows?.find((r) => r.id === 'tx-1')).toMatchObject({ version: 2 });
      expect(octRows?.find((r) => r.id === 'tx-1')?.pending).toBeUndefined();
    });
    expect(qc.getQueryData<TransactionRow[]>(sep)?.some((r) => r.id === 'tx-1')).toBe(false);
    // A month that was never loaded is never fabricated as a one-row list.
    expect(qc.getQueryData(queryKeys.transactionsMonth('h1', '2026-11'))).toBeUndefined();
  });

  it('WR-A06: an offline amount-only edit keeps the row\'s own home currency and stored rate', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);

    const qc = newClient();
    const stamped = serverTransaction({
      id: 'tx-6',
      original_currency: 'JPY',
      original_amount: 1000,
      home_currency: 'USD',
      home_amount: 640,
      rate: '0.0064000000',
      orig_per_eur: '180.0000000000',
      home_per_eur: '1.1520000000',
      rate_date: '2026-09-10',
      rate_source: 'frankfurter-v2',
      rate_pending: false,
    });
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [stamped]);
    qc.setQueryData(queryKeys.fxLatest(), [USD_RATE, JPY_RATE, { quote: 'GBP', rate: '0.85', rate_date: '2026-09-21', source: 'frankfurter-v2' }]);
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    // The user has since switched their home currency preference to GBP.
    result.current.edit({ id: 'tx-6', householdId: 'h1', month: '2026-09', expectedVersion: 1, patch: { original_amount: 2000 }, homeCurrency: 'GBP' });

    await waitFor(() => {
      const row = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'))?.[0];
      expect(row).toMatchObject({ home_currency: 'USD', home_amount: 1280, rate: '0.0064000000', rate_date: '2026-09-10', rate_pending: false });
    });
    qc.getMutationCache().clear();
  });

  it('a version conflict keeps the server row, invalidates the household transactions, and records the conflict', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const serverRow = serverTransaction({ id: 'tx-1', note: 'someone else edited this' });
    fake.respondWith({ data: [], error: null, status: 200 }); // zero rows: version mismatch
    fake.respondWith({ data: serverRow, error: null, status: 200 }); // fetchTransaction confirms it still exists

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-1' })]);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit({
      id: 'tx-1',
      householdId: 'h1',
      month: '2026-09',
      expectedVersion: 1,
      patch: { note: 'my edit' },
      homeCurrency: 'USD',
    });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'transactions', entityId: 'tx-1', kind: 'conflict', attempted: { note: 'my edit' } })
    );

    const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(rows?.[0]?.note).toBe('someone else edited this');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
  });

  it('REC-11: an add with undo records one inverse-of-insert step after the insert succeeds', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction({ version: 1 }), error: null, status: 201 }); // insert
    fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

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
      undo: { stepId: 'step-1', labelKey: 'added', labelParams: {} },
    });

    await waitFor(() => {
      const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
      expect(undoInsert).toBeDefined();
    });

    const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
    const payload = undoInsert?.args[0] as { id: string; label_key: string; ops: unknown[] };
    expect(payload.id).toBe('step-1');
    expect(payload.label_key).toBe('added');
    expect(payload.ops).toEqual([{ entity: 'transactions', id: 'uuid-0', expectedVersion: 1, patch: { deleted_at: '$now' } }]);
  });

  it('REC-11: an edit with undo captures before from the cached row for exactly the patched keys', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const original = serverTransaction({ id: 'tx-1', note: 'old note', version: 1 });
    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', note: 'new note', version: 2 })], error: null, status: 200 }); // update
    fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [original]);
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit(
      { id: 'tx-1', householdId: 'h1', month: '2026-09', expectedVersion: 1, patch: { note: 'new note' } },
      { stepId: 'step-2', ownerId: 'user-1', labelKey: 'edited', labelParams: {} }
    );

    await waitFor(() => {
      const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
      expect(undoInsert).toBeDefined();
    });

    const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
    const payload = undoInsert?.args[0] as { ops: unknown[] };
    expect(payload.ops).toEqual([{ entity: 'transactions', id: 'tx-1', expectedVersion: 2, patch: { note: 'old note' } }]);
  });

  it('an edit with undo but no cached row sends the edit without attaching an undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', note: 'new note', version: 2 })], error: null, status: 200 }); // update only

    const qc = newClient();
    // No cached row for tx-1 in this month.
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit(
      { id: 'tx-1', householdId: 'h1', month: '2026-09', expectedVersion: 1, patch: { note: 'new note' } },
      { stepId: 'step-3', ownerId: 'user-1', labelKey: 'edited', labelParams: {} }
    );

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
    expect(fake.calls.some((c) => c.table === 'undo_log')).toBe(false);
  });
});

// C-WR-04: balances, the month switcher and search all read transactions but are not month
// caches, so patching month caches alone left them stale until the app was backgrounded.
describe('C-WR-04: transaction writes refresh the derived reads', () => {
  const derivedKeys = [
    { queryKey: queryKeys.accountBalances('h1') },
    { queryKey: queryKeys.transactionMonths('h1') },
    { queryKey: queryKeys.transactionsSearchRoot('h1') },
  ];

  it('an add invalidates balances, the month list and search on success', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 90000 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
    });

    await waitFor(() => {
      for (const key of derivedKeys) expect(invalidateSpy).toHaveBeenCalledWith(key);
    });
  });

  it('an edit (here a delete) invalidates them on success, and a search hit is refreshed', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: [serverTransaction({ id: 'tx-1', deleted_at: '2026-09-24T00:00:00.000Z', version: 2 })],
      error: null,
      status: 200,
    });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-1' })]);
    qc.setQueryData(queryKeys.transactionsSearch('h1', 'rent'), [serverTransaction({ id: 'tx-1' })]);
    const { result } = await renderHook(() => useEditTransaction(), { wrapper: wrapper(qc) });

    result.current.edit({ id: 'tx-1', householdId: 'h1', month: '2026-09', expectedVersion: 1, patch: { deleted_at: '2026-09-24T00:00:00.000Z' } });

    await waitFor(() => expect(qc.getQueryState(queryKeys.transactionsSearch('h1', 'rent'))?.isInvalidated).toBe(true));
    expect(qc.getQueryState(queryKeys.transactionsMonth('h1', '2026-09'))?.isInvalidated).toBe(false); // patched, not refetched
  });

  it('a rejected add that rolls back also invalidates them', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'check violation', code: '23514' }, status: 400 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
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

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    for (const key of derivedKeys) expect(invalidateSpy).toHaveBeenCalledWith(key);
  });
});

describe('useDeleteTransaction / useMarkPaid / useSkipOccurrence', () => {
  it('remove soft-deletes optimistically, sends {deleted_at: iso}, and records an undo step with patch {deleted_at: null}', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const row = serverTransaction({ id: 'tx-1', name: 'Groceries', version: 1 });
    fake.respondWith({
      data: [serverTransaction({ id: 'tx-1', name: 'Groceries', deleted_at: '2026-09-24T00:00:00.000Z', version: 2 })],
      error: null,
      status: 200,
    });
    fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [row]);
    const { result } = await renderHook(() => useDeleteTransaction(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(
      { id: 'tx-1', household_id: 'h1', local_date: '2026-09-24', version: 1, name: 'Groceries' },
      'user-1'
    );
    expect(typeof stepId).toBe('string');

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows ?? []).toHaveLength(0); // D-30: a deleted row leaves every cached month at once
    });

    const updateCall = fake.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toMatchObject({ deleted_at: expect.any(String) });

    await waitFor(() => {
      const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
      expect(undoInsert).toBeDefined();
    });
    const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
    const payload = undoInsert?.args[0] as { label_key: string; ops: unknown[] };
    expect(payload.label_key).toBe('deleted');
    expect(payload.ops).toEqual([{ entity: 'transactions', id: 'tx-1', expectedVersion: 2, patch: { deleted_at: null } }]);
  });

  it('C-WR-01: a delete replayed after it already landed (server spells deleted_at as +00:00) settles as success with its undo step', async () => {
    jest.useFakeTimers({
      now: new Date('2026-09-28T10:00:00.120Z'),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const fake = createFakeSupabase() as FakeSupabase & DbClient;
      mockActiveClient = fake;
      const landed = serverTransaction({ id: 'tx-1', name: 'Rent', deleted_at: '2026-09-28T10:00:00.12+00:00', version: 2 });
      fake.respondWith({ data: [], error: null, status: 200 }); // zero rows: version 1 no longer matches
      fake.respondWith({ data: landed, error: null, status: 200 }); // fetchTransaction: the delete already landed
      fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

      const qc = newClient();
      qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-1', name: 'Rent' })]);
      const { result } = await renderHook(() => useDeleteTransaction(), { wrapper: wrapper(qc) });

      result.current.remove({ id: 'tx-1', household_id: 'h1', local_date: '2026-09-24', version: 1, name: 'Rent' }, 'user-1');

      await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
      const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
      expect((undoInsert?.args[0] as { ops: unknown[] }).ops).toEqual([
        { entity: 'transactions', id: 'tx-1', expectedVersion: 2, patch: { deleted_at: null } },
      ]);
      expect(recordFailedWrite).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('D-30: a VersionConflictError on delete puts the server row back (existing onError path)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const serverRow = serverTransaction({ id: 'tx-1', note: 'still here' });
    fake.respondWith({ data: [], error: null, status: 200 });
    fake.respondWith({ data: serverRow, error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [serverTransaction({ id: 'tx-1' })]);
    const { result } = await renderHook(() => useDeleteTransaction(), { wrapper: wrapper(qc) });

    result.current.remove({ id: 'tx-1', household_id: 'h1', local_date: '2026-09-24', version: 1, name: null }, 'user-1');

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.[0]?.note).toBe('still here');
    });
  });

  it('markPaid patches status/local_date via markPaidDate (the earlier of today/due date)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const row = serverTransaction({ id: 'tx-1', status: 'pending', local_date: '2026-09-20', version: 1 });
    fake.respondWith({
      data: [serverTransaction({ id: 'tx-1', status: 'paid', local_date: '2026-09-20', version: 2 })],
      error: null,
      status: 200,
    });
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [row]);
    const { result } = await renderHook(() => useMarkPaid(), { wrapper: wrapper(qc) });

    result.current.markPaid({ id: 'tx-1', household_id: 'h1', local_date: '2026-09-20', version: 1, name: null }, 'user-1', '2026-09-24');

    await waitFor(() => {
      const updateCall = fake.calls.find((c) => c.method === 'update');
      expect(updateCall?.args[0]).toEqual({ status: 'paid', local_date: '2026-09-20' });
    });
  });

  it('markPaid with adjust overrides the amount and local date', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const row = serverTransaction({ id: 'tx-1', status: 'pending', local_date: '2026-09-20', version: 1 });
    fake.respondWith({
      data: [serverTransaction({ id: 'tx-1', status: 'paid', local_date: '2026-09-25', original_amount: 1000, version: 2 })],
      error: null,
      status: 200,
    });
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [row]);
    const { result } = await renderHook(() => useMarkPaid(), { wrapper: wrapper(qc) });

    result.current.markPaid(
      { id: 'tx-1', household_id: 'h1', local_date: '2026-09-20', version: 1, name: null },
      'user-1',
      '2026-09-24',
      { amount: 1000, localDate: '2026-09-25' }
    );

    await waitFor(() => {
      const updateCall = fake.calls.find((c) => c.method === 'update');
      expect(updateCall?.args[0]).toEqual({ status: 'paid', local_date: '2026-09-25', original_amount: 1000 });
    });
  });

  it('skip patches status: skipped', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const row = serverTransaction({ id: 'tx-1', status: 'pending', version: 1 });
    fake.respondWith({ data: [serverTransaction({ id: 'tx-1', status: 'skipped', version: 2 })], error: null, status: 200 });
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [row]);
    const { result } = await renderHook(() => useSkipOccurrence(), { wrapper: wrapper(qc) });

    result.current.skip({ id: 'tx-1', household_id: 'h1', local_date: '2026-09-24', version: 1, name: null }, 'user-1');

    await waitFor(() => {
      const updateCall = fake.calls.find((c) => c.method === 'update');
      expect(updateCall?.args[0]).toEqual({ status: 'skipped' });
    });
  });
});

describe('useImportChunks / importChunk', () => {
  const importRow = (overrides: Partial<NewTransaction> = {}): NewTransaction => ({
    id: 'imp-1',
    household_id: 'h1',
    account_id: 'acc1',
    original_amount: -500,
    original_currency: 'USD',
    local_date: '2026-09-24',
    time_zone: 'UTC',
    note: null,
    status: 'paid',
    import_batch_id: 'batch-1',
    ...overrides,
  });

  it('inserts optimistic rows only into month caches already loaded, and invalidates transactionsRoot on success', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: [
        { id: 'imp-1', local_date: '2026-09-24', version: 1, rate_pending: false },
        { id: 'imp-2', local_date: '2026-09-25', version: 1, rate_pending: false },
      ],
      error: null,
      status: 201,
    });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []); // already loaded
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useImportChunks(), { wrapper: wrapper(qc) });

    result.current.enqueue({
      householdId: 'h1',
      batchId: 'batch-1',
      rows: [importRow({ id: 'imp-1' }), importRow({ id: 'imp-2', local_date: '2026-09-25' })],
      homeCurrency: 'USD',
      userId: 'user-1',
    });

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows).toHaveLength(2);
    });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') }));

    // A month never loaded is never fabricated as a one-row list.
    expect(qc.getQueryData(queryKeys.transactionsMonth('h1', '2026-10'))).toBeUndefined();
  });

  it('calls resolve-rate once per distinct (currency, date) among rate_pending rows, deduplicated', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: [
        { id: 'imp-1', local_date: '2026-09-24', version: 1, rate_pending: true },
        { id: 'imp-2', local_date: '2026-09-24', version: 1, rate_pending: true }, // same currency+date -> deduped
      ],
      error: null,
      status: 201,
    });
    fake.respondWith({ data: { row: serverTransaction({ id: 'imp-1', rate_pending: false }) }, error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const { result } = await renderHook(() => useImportChunks(), { wrapper: wrapper(qc) });

    result.current.enqueue({
      householdId: 'h1',
      batchId: 'batch-1',
      rows: [
        importRow({ id: 'imp-1', original_currency: 'JPY' }),
        importRow({ id: 'imp-2', original_currency: 'JPY' }),
      ],
      homeCurrency: 'USD',
      userId: 'user-1',
    });

    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'functions.invoke')).toHaveLength(1));
  });

  it('C-WR-03: the resolve-rate follow-up never writes an empty list into a month that was not loaded', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [{ id: 'imp-1', local_date: '2026-07-10', version: 1, rate_pending: true }], error: null, status: 201 });
    fake.respondWith({
      data: { row: serverTransaction({ id: 'imp-1', local_date: '2026-07-10', rate_pending: false }) },
      error: null,
      status: 200,
    });

    const qc = newClient();
    const { result } = await renderHook(() => useImportChunks(), { wrapper: wrapper(qc) });

    result.current.enqueue({
      householdId: 'h1',
      batchId: 'batch-1',
      rows: [importRow({ id: 'imp-1', local_date: '2026-07-10', original_currency: 'JPY' })],
      homeCurrency: 'USD',
      userId: 'user-1',
    });

    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'functions.invoke')).toHaveLength(1));
    // Let the follow-up's cache write (if any) land.
    await new Promise((r) => setTimeout(r, 0));
    expect(qc.getQueryData(queryKeys.transactionsMonth('h1', '2026-07'))).toBeUndefined();
  });

  it('a rejected chunk removes its optimistic rows and records one failed write with ids and counts only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'check violation', code: '23514' }, status: 400 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const { result } = await renderHook(() => useImportChunks(), { wrapper: wrapper(qc) });

    result.current.enqueue({
      householdId: 'h1',
      batchId: 'batch-1',
      rows: [importRow({ id: 'imp-1' })],
      homeCurrency: 'USD',
      userId: 'user-1',
    });

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows ?? []).toHaveLength(0);
    });

    await waitFor(() =>
      expect(recordFailedWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'transactions',
          entityId: 'import:batch-1',
          kind: 'rejected',
          code: '23514',
          attempted: { import_batch_id: 'batch-1', rows: 1 },
        })
      )
    );
  });
});

describe('useAddAccount / useEditAccount', () => {
  const serverAccount = (overrides: Partial<AccountRow> = {}): AccountRow => ({
    id: 'uuid-0',
    household_id: 'h1',
    created_by: 'user-1',
    name: 'Everyday chequing',
    kind: 'checking',
    currency: 'USD',
    opening_balance: 0,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 1,
    created_at: '2026-09-24T00:00:00.000Z',
    updated_at: '2026-09-24T00:00:00.000Z',
    ...overrides,
  });

  it('add returns a client UUID and applies an optimistic row in queryKeys.accounts', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverAccount(), error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    const id = result.current.add({
      household_id: 'h1',
      name: 'Everyday chequing',
      kind: 'checking',
      currency: 'USD',
      opening_balance: 0,
    });
    expect(id).toBe('uuid-0');

    await waitFor(() => {
      const rows = qc.getQueryData<AccountRow[]>(queryKeys.accounts('h1'));
      expect(rows?.[0]?.id).toBe('uuid-0');
    });
  });

  it('a version conflict on edit keeps the server row and records the conflict', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const serverRow = serverAccount({ id: 'acc-1', name: 'Renamed elsewhere' });
    fake.respondWith({ data: [], error: null, status: 200 });
    fake.respondWith({ data: serverRow, error: null, status: 200 });

    const qc = newClient();
    qc.setQueryData(queryKeys.accounts('h1'), [serverAccount({ id: 'acc-1' })]);
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    result.current.edit({ id: 'acc-1', householdId: 'h1', expectedVersion: 1, patch: { name: 'My name' } });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ entity: 'accounts', kind: 'conflict' }));

    const rows = qc.getQueryData<AccountRow[]>(queryKeys.accounts('h1'));
    expect(rows?.[0]?.name).toBe('Renamed elsewhere');
  });
});
