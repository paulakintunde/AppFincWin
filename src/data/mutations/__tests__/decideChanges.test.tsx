// 05-40: Changes coming up add / edit / remove through the write queue, one undo step each (D-27).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideChangeRow } from '@/db/decideChanges';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerDecideChangeMutations, useAddChange, useEditChange, useRemoveChange } from '../decideChanges';
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
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const KEY = queryKeys.decideChanges('user-1', 'hh-1');

const change = (id: string, overrides: Partial<DecideChangeRow> = {}): DecideChangeRow => ({
  id,
  household_id: 'hh-1',
  created_by: 'user-1',
  updated_by: null,
  kind: 'spending',
  name: 'Nursery',
  monthly_amount: 90000,
  currency: 'GBP',
  start_month: '2027-01',
  end_month: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; labelParams: unknown; ops: { entity: string; expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideChangeMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAddChange', () => {
  it('inserts with a client id, adds the row to the cache and records a changeAdded step that soft-deletes it', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(change('id-1')));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useAddChange(), { wrapper: wrapper(qc) });

    const out = result.current.add({
      householdId: 'hh-1',
      ownerId: 'user-1',
      change: { kind: 'spending', name: 'Nursery', monthly_amount: 90000, currency: 'GBP', start_month: '2027-01', end_month: null },
    });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      id: 'id-1',
      household_id: 'hh-1',
      monthly_amount: 90000,
    });
    expect(lastStep()).toMatchObject({
      id: 'id-2',
      labelKey: 'changeAdded',
      labelParams: { name: 'Nursery' },
      ops: [{ entity: 'decide_changes', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
    expect(qc.getQueryData<DecideChangeRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-1']);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY }));
  });

  it('rolls the optimistic row back and records ids only on a rejection', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useAddChange(), { wrapper: wrapper(qc) });

    result.current.add({
      householdId: 'hh-1',
      ownerId: 'user-1',
      change: { kind: 'income', name: 'Secret raise', monthly_amount: 123456, currency: 'GBP', start_month: '2027-01', end_month: null },
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'decide_changes', entityId: 'id-1', attempted: { changeId: 'id-1' } });
    expect(JSON.stringify(record)).not.toMatch(/Secret|123456/);
    expect(qc.getQueryData<DecideChangeRow[]>(KEY)).toEqual([]);
  });
});

describe('useEditChange', () => {
  it('patches with expectedVersion and the step restores the before-values of the patched keys only', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([change('c1', { monthly_amount: 95000, version: 2 })]));
    const { result } = await renderHook(() => useEditChange(), { wrapper: wrapper(qc) });

    result.current.edit(change('c1'), { monthly_amount: 95000 });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ monthly_amount: 95000 });
    expect(lastStep()).toMatchObject({
      labelKey: 'changeEdited',
      ops: [{ entity: 'decide_changes', expectedVersion: 2, patch: { monthly_amount: 90000 } }],
    });
    expect(Object.keys(lastStep().ops[0]!.patch as object)).toEqual(['monthly_amount']);
  });

  it('rejects an empty edit before mutating', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useEditChange(), { wrapper: wrapper(qc) });
    expect(() => result.current.edit(change('c1'), {})).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('classifies a version conflict, parks it and takes the server row', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [change('c1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(change('c1', { monthly_amount: 70000, version: 4 })));
    const { result } = await renderHook(() => useEditChange(), { wrapper: wrapper(qc) });

    result.current.edit(change('c1'), { monthly_amount: 95000 });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ kind: 'conflict', entity: 'decide_changes', entityId: 'c1' });
    expect(JSON.stringify(record)).not.toMatch(/95000|Nursery/);
    expect(qc.getQueryData<DecideChangeRow[]>(KEY)?.[0]).toMatchObject({ monthly_amount: 70000, version: 4 });
  });
});

describe('useRemoveChange', () => {
  it('soft deletes, drops the cached row and the step restores deleted_at null', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [change('c1')]);
    fake.respondWith(ok([change('c1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useRemoveChange(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(change('c1'));
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string };
    expect(typeof patch.deleted_at).toBe('string');
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'changeRemoved',
      ops: [{ entity: 'decide_changes', expectedVersion: 2, patch: { deleted_at: null } }],
    });
    expect(qc.getQueryData<DecideChangeRow[]>(KEY)).toEqual([]);
  });
});
