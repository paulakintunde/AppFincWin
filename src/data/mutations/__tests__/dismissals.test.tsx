// 05.2-15 (DSU-05): "Not regular" answers: write with Undo, change back with Undo, nothing written otherwise.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerMutationDefaults } from '../index';
import { useAddDismissal, useRemoveDismissal } from '../dismissals';
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

const HH = 'hh-1';
const KEY = queryKeys.recurringDismissals(HH);

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const row = (overrides: Partial<RecurringDismissalRow> = {}): RecurringDismissalRow => ({
  id: 'dis-1',
  household_id: HH,
  payee_key: 'gym',
  direction: 'out',
  dismissed_at: '2026-10-01T00:00:00Z',
  created_by: 'user-1',
  deleted_at: null,
  version: 1,
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('registration', () => {
  it('registers a default mutationFn for both keys', () => {
    const { qc } = setup();
    expect(qc.getMutationDefaults(mutationKeys.addDismissal).mutationFn).toBeDefined();
    expect(qc.getMutationDefaults(mutationKeys.removeDismissal).mutationFn).toBeDefined();
  });
});

describe('useAddDismissal', () => {
  it('inserts the row with a client id, shows it at once, and records a paymentDismissed step that soft deletes it', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ id: 'id-2', version: 1 })));
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    const out = result.current.dismiss({ payeeKey: 'gym', direction: 'out' });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)?.[0]?.payee_key).toBe('gym'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      household_id: HH,
      payee_key: 'gym',
      direction: 'out',
    });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: 'id-2',
      labelKey: 'paymentDismissed',
      ops: [{ entity: 'recurring_dismissals', id: 'id-2', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
  });

  it('reads back a duplicate client id as landed', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(row({ id: 'id-1' })));
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: 'gym', direction: 'out' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('removes the optimistic row and records the id only when rejected', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: 'gym', direction: 'out' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)).toEqual([]);
    const rec = recordFailedWrite.mock.calls[0]![0] as { entityId: string; attempted: unknown };
    expect(rec.entityId).toBe('id-1');
    expect(JSON.stringify(rec)).not.toContain('gym');
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('queues while offline and writes on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: 'gym', direction: 'in' });
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)).toHaveLength(1));
    expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(0);
    fake.respondWith(ok(row({ id: 'id-1', direction: 'in' })));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
  });
});

describe('useRemoveDismissal', () => {
  it('soft deletes the row version-conditionally, drops it from the cache, and records a step that puts it back', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [row({ version: 2 }), row({ id: 'dis-2', payee_key: 'rent' })]);
    fake.respondWith(ok([row({ version: 3, deleted_at: '2026-10-28T00:00:00Z' })]));
    const { result } = await renderHook(() => useRemoveDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    const out = result.current.restore(row({ version: 2 }));
    expect(out).toEqual({ stepId: 'id-1' });
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)?.map((r) => r.id)).toEqual(['dis-2']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string };
    expect(Object.keys(patch)).toEqual(['deleted_at']);
    expect(typeof patch.deleted_at).toBe('string');
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 2]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: 'id-1',
      labelKey: 'paymentDismissed',
      ops: [{ entity: 'recurring_dismissals', id: 'dis-1', expectedVersion: 3, patch: { deleted_at: null } }],
    });
  });

  it('parks a version conflict and refetches', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [row()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(row({ version: 9 })));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useRemoveDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.restore(row());
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entityId: 'dis-1', kind: 'conflict', code: 'version-conflict' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('accepts a landed replay (server row already deleted at the same instant)', async () => {
    const { fake, qc } = setup();
    const instant = '2026-10-28T00:00:00.000Z';
    const spy = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(instant);
    qc.setQueryData(KEY, [row()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(row({ version: 2, deleted_at: instant })));
    const { result } = await renderHook(() => useRemoveDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.restore(row());
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    spy.mockRestore();
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ ops: [{ expectedVersion: 2 }] });
  });
});
