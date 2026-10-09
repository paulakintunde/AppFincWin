// 02-17 Task 2: account add/edit record an undo step, and carry overdraft/credit limits and
// negative opening balances as ordinary values (REC-08, REC-11, REC-17, D-48, D-49).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerAccountMutations, useAddAccount, useEditAccount } from '../accounts';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `id-${++mockUuid}`),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

jest.mock('@/db/undoLog', () => ({
  insertUndoStep: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerAccountMutations(qc);
  return qc;
}

const acct = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  id: 'a1',
  deleted_at: null,
  is_sample: false,
  household_id: 'h1',
  created_by: null,
  name: 'Current',
  kind: 'checking',
  currency: 'GBP',
  opening_balance: 0,
  archived_at: null,
  updated_by: null,
  overdraft_limit: null,
  credit_limit: null,
  version: 1,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; labelParams: unknown; ops: { id: string; expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

const addInput = {
  household_id: 'h1',
  name: 'Current',
  kind: 'checking' as const,
  currency: 'GBP',
  opening_balance: 0,
};

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  insertUndoStep.mockClear();
});

describe('useAddAccount undo capture', () => {
  it('returns the id and, given an undo capture, records an accountAdded step that archives it at version 1', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(acct({ id: 'id-1' })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    const id = result.current.add(addInput, { stepId: 'step-a', ownerId: 'user-1' });
    expect(id).toBe('id-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep()).toMatchObject({
      id: 'step-a',
      labelKey: 'accountAdded',
      labelParams: { name: 'Current' },
      ops: [{ id: 'id-1', expectedVersion: 1, patch: { archived_at: '$now' } }],
    });
  });

  it('records no step when undo is omitted', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(acct({ id: 'id-1' })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    result.current.add(addInput);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('sends an overdraft limit and a negative opening balance, and the optimistic row carries both (D-49)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(acct({ id: 'id-1', opening_balance: -24000, overdraft_limit: 50000 })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    result.current.add({ ...addInput, opening_balance: -24000, overdraft_limit: 50000 });
    await waitFor(() => expect(qc.getQueryData<AccountRow[]>(queryKeys.accounts('h1'))).toHaveLength(1));
    const cached = qc.getQueryData<AccountRow[]>(queryKeys.accounts('h1'));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ opening_balance: -24000, overdraft_limit: 50000 });
    expect(cached?.[0]).toMatchObject({ opening_balance: -24000, overdraft_limit: 50000 });
  });

  it('accepts a card owing more than its credit limit', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(acct({ id: 'id-1', kind: 'credit', opening_balance: -125000, credit_limit: 100000 })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    expect(() =>
      result.current.add({ ...addInput, kind: 'credit', opening_balance: -125000, credit_limit: 100000 })
    ).not.toThrow();
    await waitFor(() => expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ credit_limit: 100000 }));
  });

  it('throws RangeError before mutating for a negative or unsafe limit', async () => {
    mockActiveClient = createFakeSupabase();
    const qc = newClient();
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrapper(qc) });

    expect(() => result.current.add({ ...addInput, overdraft_limit: -1 })).toThrow(RangeError);
    expect(() => result.current.add({ ...addInput, credit_limit: 1.5 })).toThrow(RangeError);
    expect(() => result.current.add({ ...addInput, credit_limit: Number.MAX_SAFE_INTEGER + 2 })).toThrow(RangeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('useEditAccount undo capture', () => {
  const editVars = (patch: object) => ({ id: 'a1', householdId: 'h1', expectedVersion: 1, patch });

  it('captures before from the cached list and records an accountEdited step at the returned version', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([acct({ name: 'Main', version: 2 })]));
    const qc = newClient();
    qc.setQueryData(queryKeys.accounts('h1'), [acct()]);
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    expect(result.current.edit(editVars({ name: 'Main' }), { stepId: 'step-e', ownerId: 'user-1' })).toBe(true);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep()).toMatchObject({
      id: 'step-e',
      labelKey: 'accountEdited',
      labelParams: { name: 'Main' },
      ops: [{ id: 'a1', expectedVersion: 2, patch: { name: 'Current' } }],
    });
  });

  it('restores the previous credit limit, and a cleared overdraft limit comes back', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([acct({ kind: 'credit', credit_limit: 150000, version: 2 })]));
    fake.respondWith(ok([acct({ overdraft_limit: null, version: 3 })]));
    const qc = newClient();
    qc.setQueryData(queryKeys.accounts('h1'), [acct({ kind: 'credit', credit_limit: 100000, overdraft_limit: 20000 })]);
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    result.current.edit(editVars({ credit_limit: 150000 }), { stepId: 's1', ownerId: 'user-1' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(lastStep().ops[0]).toMatchObject({ patch: { credit_limit: 100000 } });

    qc.setQueryData(queryKeys.accounts('h1'), [acct({ overdraft_limit: 20000, version: 2 })]);
    result.current.edit({ ...editVars({ overdraft_limit: null }), expectedVersion: 2 }, { stepId: 's2', ownerId: 'user-1' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));
    expect(fake.calls.filter((c) => c.method === 'update')[1]?.args[0]).toEqual({ overdraft_limit: null });
    expect(lastStep().ops[0]).toMatchObject({ expectedVersion: 3, patch: { overdraft_limit: 20000 } });
  });

  it('sends the edit without a step, and returns false, when the account is not cached', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([acct({ name: 'Main', version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    expect(result.current.edit(editVars({ name: 'Main' }), { stepId: 's', ownerId: 'user-1' })).toBe(false);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('edits without undo exactly as before', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([acct({ name: 'Main', version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    expect(result.current.edit(editVars({ name: 'Main' }))).toBe(false);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
  });

  it('throws RangeError before mutating for an overdraft limit of -1', async () => {
    mockActiveClient = createFakeSupabase();
    const qc = newClient();
    const { result } = await renderHook(() => useEditAccount(), { wrapper: wrapper(qc) });

    expect(() => result.current.edit(editVars({ overdraft_limit: -1 }))).toThrow(RangeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});
