/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, dehydrate, hydrate, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideAnswerRow } from '@/db/decideAnswers';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerDecideAnswerMutations, useRemoveDecideAnswer, useSaveDecideAnswer } from '../decideAnswers';
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

const KEY = queryKeys.decideAnswers('user-1', 'hh-1');
const SERIES = '3f0c2a9e-1b4d-4c5e-8f60-1234567890ab';
const CHECK = '9a1b2c3d-4e5f-4a6b-8c7d-0123456789ab';

const answer = (id: string, overrides: Partial<DecideAnswerRow> = {}): DecideAnswerRow => ({
  id,
  household_id: 'hh-1',
  created_by: 'user-1',
  kind: 'expected_income',
  key: '2026-12',
  amount: 300000,
  bool_value: null,
  on_date: '2026-10-28',
  check_id: null,
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

type Step = { id: string; labelKey: string; labelParams: unknown; ops: { entity: string; id: string; expectedVersion: number; patch: unknown }[] };
function lastStep(): Step {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideAnswerMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('registration', () => {
  it('both mutation keys have a mutationFn', () => {
    const { qc } = setup();
    expect(qc.getMutationDefaults(mutationKeys.saveDecideAnswer)?.mutationFn).toEqual(expect.any(Function));
    expect(qc.getMutationDefaults(mutationKeys.removeDecideAnswer)?.mutationFn).toEqual(expect.any(Function));
  });
});

describe('useSaveDecideAnswer insert', () => {
  it('pay_arrival with no live row inserts and undo soft-deletes it', async () => {
    const { fake, qc } = setup();
    const key = `${SERIES}:2026-10-15`;
    fake.respondWith(ok(answer('id-1', { kind: 'pay_arrival', key, amount: null, bool_value: true, on_date: '2026-10-15' })));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    const out = result.current.save({ kind: 'pay_arrival', seriesId: SERIES, payDate: '2026-10-15', arrived: true });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(qc.getQueryData<DecideAnswerRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-1']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      kind: 'pay_arrival',
      key,
      amount: null,
      bool_value: true,
      on_date: '2026-10-15',
      check_id: null,
    });
    expect(lastStep()).toMatchObject({
      id: 'id-2',
      labelKey: 'answerSaved',
      ops: [{ entity: 'decide_answers', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY }));
  });

  it('held_bridge and volatile_cover carry check_id and key = checkId', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(answer('id-1', { kind: 'held_bridge', key: CHECK, check_id: CHECK, amount: 5000, on_date: null })));
    fake.respondWith(ok(answer('id-3', { kind: 'volatile_cover', key: CHECK, check_id: CHECK, amount: null, bool_value: false, on_date: null })));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    result.current.save({ kind: 'held_bridge', checkId: CHECK, amount: 5000 });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    result.current.save({ kind: 'volatile_cover', checkId: CHECK, covers: false });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));

    const inserts = fake.calls.filter((c) => c.method === 'insert').map((c) => c.args[0]);
    expect(inserts[0]).toMatchObject({ kind: 'held_bridge', key: CHECK, check_id: CHECK, amount: 5000, bool_value: null });
    expect(inserts[1]).toMatchObject({ kind: 'volatile_cover', key: CHECK, check_id: CHECK, amount: null, bool_value: false });
  });

  it('rejects an amount that is not whole minor units before writing', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    expect(() => result.current.save({ kind: 'held_bridge', checkId: CHECK, amount: 10.5 })).toThrow(RangeError);
    expect(() => result.current.save({ kind: 'held_bridge', checkId: CHECK, amount: -1 })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a duplicate insert is read back as landed', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(answer('id-1')));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 300000, at: '2026-10-28' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(lastStep()).toMatchObject({ labelKey: 'answerSaved', ops: [{ id: 'id-1', expectedVersion: 1 }] });
  });

  it('a rejection rolls the optimistic row back and records ids only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 123457, at: '2026-10-28' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'decide_answers', entityId: 'id-1', attempted: { answerId: 'id-1' } });
    expect(JSON.stringify(record)).not.toMatch(/123457/);
    expect(qc.getQueryData<DecideAnswerRow[]>(KEY)).toEqual([]);
  });

  it('a transient failure records nothing and leaves the optimistic row', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'boom', code: '57P01' }, status: 503 });
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'volatile_cover', checkId: CHECK, covers: true });
    await waitFor(() => expect(qc.getQueryData<DecideAnswerRow[]>(KEY)).toHaveLength(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('useSaveDecideAnswer update', () => {
  it('a live row with a different amount is version-checked updated and undo restores amount and date', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith(ok([answer('a1', { amount: 350000, on_date: '2026-11-02', version: 2 })]));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    const out = result.current.save({ kind: 'expected_income', month: '2026-12', amount: 350000, at: '2026-11-02' });
    expect(out).toMatchObject({ id: 'a1' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ amount: 350000, on_date: '2026-11-02' });
    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version' && c.args[1] === 1)).toBe(true);
    expect(lastStep()).toMatchObject({
      labelKey: 'answerSaved',
      ops: [{ entity: 'decide_answers', id: 'a1', expectedVersion: 2, patch: { amount: 300000, on_date: '2026-10-28' } }],
    });
    expect(qc.getQueryData<DecideAnswerRow[]>(KEY)?.[0]).toMatchObject({ amount: 350000, version: 2 });
  });

  it('only the changed field is patched (bool answer flips)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('c1', { kind: 'volatile_cover', key: CHECK, check_id: CHECK, amount: null, bool_value: true, on_date: null })]);
    fake.respondWith(ok([answer('c1', { kind: 'volatile_cover', key: CHECK, check_id: CHECK, amount: null, bool_value: false, on_date: null, version: 2 })]));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'volatile_cover', checkId: CHECK, covers: false });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ bool_value: false });
    expect(lastStep().ops[0]).toMatchObject({ patch: { bool_value: true } });
  });

  it('identical values return null and write nothing', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    expect(result.current.save({ kind: 'expected_income', month: '2026-12', amount: 300000, at: '2026-10-28' })).toBeNull();
    expect(fake.calls).toHaveLength(0);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('a soft-deleted cached row is not treated as live', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1', { deleted_at: '2026-10-02T00:00:00Z' })]);
    fake.respondWith(ok(answer('id-1')));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 300000, at: '2026-10-28' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.some((c) => c.method === 'insert')).toBe(true);
  });

  it('a version conflict is parked, takes the server row and carries no amount', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(answer('a1', { amount: 999000, version: 4 })));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 350000, at: '2026-10-28' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ kind: 'conflict', entity: 'decide_answers', entityId: 'a1', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/350000|999000/);
    expect(qc.getQueryData<DecideAnswerRow[]>(KEY)?.[0]).toMatchObject({ amount: 999000, version: 4 });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('a conflict against a deleted server row drops it from the list', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(answer('a1', { deleted_at: '2026-10-03T00:00:00Z', version: 3 })));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 350000, at: '2026-10-28' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<DecideAnswerRow[]>(KEY)).toEqual([]);
  });

  it('a refused update invalidates and records a rejected write', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 350000, at: '2026-10-28' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'rejected', entityId: 'a1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('a landed replay is accepted', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(answer('a1', { amount: 350000, version: 2 })));
    const { result } = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.save({ kind: 'expected_income', month: '2026-12', amount: 350000, at: '2026-10-28' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('useRemoveDecideAnswer', () => {
  it('sets deleted_at and undo clears it', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith(ok([answer('a1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useRemoveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });

    const { stepId } = result.current.remove(answer('a1'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(qc.getQueryData<DecideAnswerRow[]>(KEY)).toEqual([]);
    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string };
    expect(Object.keys(patch)).toEqual(['deleted_at']);
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'answerRemoved',
      ops: [{ entity: 'decide_answers', id: 'a1', expectedVersion: 2, patch: { deleted_at: null } }],
    });
  });

  it('a refused remove records a rejected write with no amount', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [answer('a1')]);
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useRemoveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(qc) });
    result.current.remove(answer('a1'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toMatch(/300000/);
  });
});

describe('offline', () => {
  it('paused answer writes replay in order after reconnect', async () => {
    const first = setup();
    onlineManager.setOnline(false);
    try {
      const save = await renderHook(() => useSaveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(first.qc) });
      const remove = await renderHook(() => useRemoveDecideAnswer('user-1', 'hh-1'), { wrapper: wrapper(first.qc) });
      const { id } = save.result.current.save({ kind: 'held_bridge', checkId: CHECK, amount: 5000 })!;
      await waitFor(() => expect(first.qc.getQueryData<DecideAnswerRow[]>(KEY)?.map((r) => r.id)).toEqual([id]));
      remove.result.current.remove(first.qc.getQueryData<DecideAnswerRow[]>(KEY)![0]!);
      await waitFor(() => expect(first.qc.getMutationCache().getAll()).toHaveLength(2));
      await waitFor(() => expect(first.qc.getMutationCache().getAll().every((m) => m.state.isPaused)).toBe(true));

      const persisted = JSON.parse(JSON.stringify(dehydrate(first.qc))) as ReturnType<typeof dehydrate>;
      first.qc.clear();
      clearVersionChains();
      const second = setup();
      hydrate(second.qc, persisted);
      const bridge = answer(id, { kind: 'held_bridge', key: CHECK, check_id: CHECK, amount: 5000, on_date: null });
      second.fake.respondWith(ok(bridge));
      second.fake.respondWith(ok([{ ...bridge, deleted_at: '2026-10-02T00:00:00Z', version: 2 }]));
      onlineManager.setOnline(true);
      await second.qc.resumePausedMutations();
      await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));

      const writes = second.fake.calls.filter((c) => c.method === 'insert' || c.method === 'update').map((c) => c.method);
      expect(writes).toEqual(['insert', 'update']);
      expect(insertUndoStep.mock.calls.map((c) => (c[1] as Step).labelKey)).toEqual(['answerSaved', 'answerRemoved']);
      expect(recordFailedWrite).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
