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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { MAX_SERVER_ERROR_RETRIES } from '@/data/sync/writeErrors';
import { registerMutationDefaults } from '../index';
import { useAddTransaction, useEditTransaction, type AddTransactionVars } from '../transactions';
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
  recordFailedWrite.mockClear();
});

describe('useAddTransaction', () => {
  it('generates a client UUID, applies an optimistic pending row, and sends exactly the 8 granted keys', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: serverTransaction(), error: null, status: 201 });

    const qc = newClient();
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

  it('a duplicate-id (23505) insert is treated as success via the fetch-existing path, no rollback', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    fake.respondWith({ data: serverTransaction(), error: null, status: 200 });

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
