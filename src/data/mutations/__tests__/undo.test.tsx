// 02-16 Task 2: undo and "roll back to here" as queued writes (REC-11, REC-12, D-26..D-29).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import type { RecordUndoStepVars } from '../undoCapture';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useRollbackUndo, useUndo, type UndoVars } from '../undo';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const vars: UndoVars = {
  stepId: 'step-1',
  ownerId: 'user-1',
  householdId: 'h1',
  labelKey: 'deletedMany',
  labelParams: { n: 30 },
};

const refusalJson = { entity: 'transactions', id: 't9', updated_by: 'sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' };

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

const rpc = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');

beforeEach(() => {
  onlineManager.setOnline(true);
  resetToastForTests();
  recordFailedWrite.mockClear();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useUndo', () => {
  it('calls apply_undo_step, refreshes every derived read and raises an info toast with the label params', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 });
    const qc = newClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    result.current.undo(vars);

    await waitFor(() => expect(getToast()).not.toBeNull());
    expect(rpc(fake)[0]?.args).toEqual(['apply_undo_step', { p_step_id: 'step-1' }]);
    expect(getToast()).toMatchObject({
      kind: 'info',
      text: { key: 'undo.reverted', params: { labelKey: 'deletedMany', n: 30 } },
    });
    for (const key of [
      queryKeys.transactionsRoot('h1'),
      queryKeys.accounts('h1'),
      queryKeys.recurringSeries('h1'),
      queryKeys.categories('user-1'),
      queryKeys.undoLog('user-1'),
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('treats already-undone like undone', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'already-undone' }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    result.current.undo(vars);
    await waitFor(() => expect(getToast()?.text?.key).toBe('undo.reverted'));
  });

  it('a refused undo records a changed-elsewhere failed write and raises a refusal toast with who and what', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'refused', refusal: refusalJson }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    result.current.undo(vars);

    await waitFor(() => expect(getToast()?.kind).toBe('refusal'));
    expect(getToast()?.refusal).toMatchObject({ entity: 'transactions', id: 't9', updatedBy: 'sam', recordName: 'Groceries' });
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'undo_log', entityId: 'step-1', kind: 'conflict', code: 'version-conflict' })
    );
    // Never retried: exactly one rpc.
    expect(rpc(fake)).toHaveLength(1);
  });

  it('not-found raises the not-recorded info toast', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'not-found' }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    result.current.undo(vars);
    await waitFor(() => expect(getToast()).toMatchObject({ kind: 'info', text: { key: 'undo.notRecorded' } }));
  });
});

describe('useRollbackUndo', () => {
  it('rolls back and reports the count', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'undone', undone: 3 }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useRollbackUndo(), { wrapper: wrapper(qc) });

    result.current.rollbackTo({ stepId: 'step-1', ownerId: 'user-1', householdId: 'h1' });

    await waitFor(() => expect(getToast()).not.toBeNull());
    expect(rpc(fake)[0]?.args).toEqual(['rollback_undo_to', { p_step_id: 'step-1' }]);
    expect(getToast()).toMatchObject({ kind: 'info', text: { key: 'undo.rolledBack', params: { count: 3 } } });
  });

  it('a refusal part-way raises a refusal toast carrying the conflict and the count already undone', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'refused', undone: 2, step_id: 'step-7', refusal: refusalJson }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useRollbackUndo(), { wrapper: wrapper(qc) });

    result.current.rollbackTo({ stepId: 'step-1', ownerId: 'user-1', householdId: 'h1' });

    await waitFor(() => expect(getToast()?.kind).toBe('refusal'));
    expect(getToast()).toMatchObject({
      refusal: { id: 't9', updatedBy: 'sam' },
      text: { key: 'undo.rolledBack', params: { count: 2 } },
    });
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ entity: 'undo_log', entityId: 'step-7', kind: 'conflict' }));
  });

  it('a blocked rollback with no fresh conflict still refuses visibly and records nothing new', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'blocked', undone: 0, blocked_by: 'step-5', refusal: null }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useRollbackUndo(), { wrapper: wrapper(qc) });

    result.current.rollbackTo({ stepId: 'step-1', ownerId: 'user-1', householdId: 'h1' });

    await waitFor(() => expect(getToast()?.kind).toBe('refusal'));
    expect(getToast()?.text).toBeNull();
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('queue ordering offline', () => {
  it('a queued undo runs after the earlier queued writes on reconnect', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    result.current.undo(vars);
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
    expect(fake.calls).toHaveLength(0);

    fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 });
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    await waitFor(() => expect(rpc(fake)).toHaveLength(1));
  });

  // C-IN-06: an undo-record that fell back to the queue must land before the undo-apply the
  // user issued after it -- otherwise apply_undo_step finds no step and answers not-found.
  it('a queued undo-record lands before a later queued undo-apply', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    const { result } = await renderHook(() => useUndo(), { wrapper: wrapper(qc) });

    const record: RecordUndoStepVars = {
      ownerId: 'user-1',
      step: { id: 'step-1', labelKey: 'deletedMany', labelParams: { n: 30 }, touchedIds: ['a'], ops: [{ entity: 'transactions', id: 'a', expectedVersion: 2, patch: { deleted_at: null } }] },
    };
    void qc.getMutationCache().build(qc, { mutationKey: mutationKeys.recordUndoStep }).execute(record).catch(() => undefined);
    result.current.undo(vars);

    await waitFor(() => {
      const all = qc.getMutationCache().getAll();
      expect(all).toHaveLength(2);
      expect(all.every((m) => m.state.isPaused)).toBe(true);
    });

    fake.respondWith({ data: null, error: null, status: 201 }); // insertUndoStep
    fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 }); // apply_undo_step
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();

    await waitFor(() => expect(rpc(fake)).toHaveLength(1));
    const order = fake.calls.filter((c) => (c.table === 'undo_log' && c.method === 'insert') || c.method === 'rpc').map((c) => c.method);
    expect(order).toEqual(['insert', 'rpc']);
  });
});
