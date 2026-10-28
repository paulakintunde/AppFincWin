/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, dehydrate, hydrate, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import {
  registerDecidePotMutations,
  useAddPot,
  useDeletePot,
  useEditPot,
  useSetPotDone,
} from '../decidePots';
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

const KEY = queryKeys.savingsGoals('user-1', 'hh-1');

const pot = (id: string, overrides: Partial<SavingsGoalRow> = {}): SavingsGoalRow => ({
  id,
  household_id: 'hh-1',
  created_by: 'user-1',
  check_id: null,
  name: 'Car service',
  currency: 'GBP',
  target: 60000,
  monthly_amount: null,
  ready_by: '2027-03-31',
  opening_saved: 0,
  kind: 'pot',
  done_at: null,
  is_sample: false,
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
  registerDecidePotMutations(qc);
  return { fake, qc };
}

const NEW_POT = { name: 'Car service', currency: 'GBP', target: 60000, ready_by: '2027-03-31', opening_saved: 0 };

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAddPot', () => {
  it('D-101 every pot action is one undo step with its label (add)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(pot('id-1')));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useAddPot(), { wrapper: wrapper(qc) });

    const out = result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: NEW_POT });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    // optimistic, before the server answers
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-1']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    // kind is sent on insert and is always a pot; no check_id or monthly_amount from the client
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      kind: 'pot',
      ...NEW_POT,
    });
    expect(lastStep()).toMatchObject({
      id: 'id-2',
      labelKey: 'potAdded',
      labelParams: { name: 'Car service' },
      ops: [{ entity: 'savings_goals', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY }));
  });

  it('D-101 a duplicate insert is read back as landed', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(pot('id-1', { version: 1 })));
    const { result } = await renderHook(() => useAddPot(), { wrapper: wrapper(qc) });

    result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: NEW_POT });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(lastStep()).toMatchObject({ labelKey: 'potAdded', ops: [{ id: 'id-1', expectedVersion: 1 }] });
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-1']);
  });

  it('D-101 a rejection rolls the optimistic row back and records ids only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useAddPot(), { wrapper: wrapper(qc) });

    result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: { ...NEW_POT, name: 'Secret fund', target: 123457 } });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'savings_goals', entityId: 'id-1', attempted: { potId: 'id-1' } });
    expect(JSON.stringify(record)).not.toMatch(/Secret|123457/);
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)).toEqual([]);
  });
});

describe('buckets, Held in and colour (05.2 D-22, D-05)', () => {
  const BUCKET = {
    name: 'College',
    currency: 'GBP',
    bucket: 'college' as const,
    target: null,
    ready_by: null,
    monthly_amount: 20_000,
    account_id: null,
    color_key: 'slate' as const,
    opening_saved: 0,
  };

  it('adds a bucket at a monthly amount with no goal and no date, one undo step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(pot('id-1', { ...BUCKET, kind: 'pot' })));
    const { result } = await renderHook(() => useAddPot(), { wrapper: wrapper(qc) });

    result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: BUCKET });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]?.monthly_amount).toBe(20_000));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      kind: 'pot',
      ...BUCKET,
    });
    expect(lastStep()).toMatchObject({ labelKey: 'potAdded', ops: [{ id: 'id-1', patch: { deleted_at: '$now' } }] });
  });

  it('adds a bucket at $0 a month', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(pot('id-1', { bucket: 'trip', target: null, ready_by: null, monthly_amount: 0 })));
    const { result } = await renderHook(() => useAddPot(), { wrapper: wrapper(qc) });
    result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: { ...BUCKET, monthly_amount: 0 } });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('edits Held in with an undo step restoring the previous account', async () => {
    const { fake, qc } = setup();
    const row = pot('p1', { account_id: null });
    qc.setQueryData(KEY, [row]);
    fake.respondWith(ok([pot('p1', { account_id: 'a1', version: 2 })]));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    result.current.edit(row, { account_id: 'a1' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ account_id: 'a1' });
    expect(lastStep()).toMatchObject({ labelKey: 'potEdited', ops: [{ id: 'p1', patch: { account_id: null } }] });
  });

  it('edits the colour', async () => {
    const { fake, qc } = setup();
    const row = pot('p1', { color_key: 'teal' });
    qc.setQueryData(KEY, [row]);
    fake.respondWith(ok([pot('p1', { color_key: 'plum', version: 2 })]));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });
    result.current.edit(row, { color_key: 'plum' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep().ops[0]).toMatchObject({ patch: { color_key: 'teal' } });
  });

  it('edits the monthly amount on a bucket and refuses it on an ordinary pot', async () => {
    const { fake, qc } = setup();
    const bucket = pot('b1', { bucket: 'college', target: null, ready_by: null, monthly_amount: 20_000 });
    qc.setQueryData(KEY, [bucket]);
    fake.respondWith(ok([{ ...bucket, monthly_amount: 30_000, version: 2 }]));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    result.current.edit(bucket, { monthly_amount: 30_000 });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep().ops[0]).toMatchObject({ patch: { monthly_amount: 20_000 } });

    const calls = fake.calls.length;
    expect(() => result.current.edit(pot('p2'), { monthly_amount: 5 })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(calls);
  });
});

describe('useEditPot', () => {
  it('D-101 every pot action is one undo step with its label (edit)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1')]);
    fake.respondWith(ok([pot('p1', { target: 72000, version: 2 })]));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    const stepId = result.current.edit(pot('p1'), { target: 72000 });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ target: 72000 });
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'potEdited',
      labelParams: { name: 'Car service' },
      ops: [{ entity: 'savings_goals', id: 'p1', expectedVersion: 2, patch: { target: 60000 } }],
    });
    expect(Object.keys(lastStep().ops[0]!.patch as object)).toEqual(['target']);
  });

  it('D-101 an edit replays once and a landed replay is accepted', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1')]);
    // the first attempt already landed (killed before the answer): the version check finds no row, the server row has the patch
    fake.respondWith(ok([]));
    fake.respondWith(ok(pot('p1', { target: 72000, version: 2 })));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    result.current.edit(pot('p1'), { target: 72000 });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(lastStep().ops[0]).toMatchObject({ expectedVersion: 2, patch: { target: 60000 } });
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]).toMatchObject({ target: 72000, version: 2 });
  });

  it('D-101 refuses an empty edit, a Wait goal edit and the delete or done keys before mutating', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });
    expect(() => result.current.edit(pot('p1'), {})).toThrow(RangeError);
    expect(() => result.current.edit(pot('w1', { kind: 'wait', check_id: 'k1' }), { name: 'x' })).toThrow(RangeError);
    expect(() => result.current.edit(pot('p1'), { deleted_at: 'now' })).toThrow(RangeError);
    expect(() => result.current.edit(pot('p1'), { done_at: 'now' })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('D-101 a version conflict is parked, takes the server row and carries no name or amount', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(pot('p1', { target: 99000, version: 4 })));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    result.current.edit(pot('p1'), { target: 72000 });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ kind: 'conflict', entity: 'savings_goals', entityId: 'p1', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/72000|Car service/);
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]).toMatchObject({ target: 99000, version: 4 });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('D-101 a refused save leaves the queue moving (the next write still runs)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1'), pot('p2')]);
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    fake.respondWith(ok([pot('p2', { name: 'Holiday', version: 2 })]));
    const { result } = await renderHook(() => useEditPot(), { wrapper: wrapper(qc) });

    result.current.edit(pot('p1'), { name: 'Nope' });
    result.current.edit(pot('p2'), { name: 'Holiday' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledTimes(1);
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'rejected', entityId: 'p1' });
    expect(lastStep().ops[0]).toMatchObject({ id: 'p2' });
  });
});

describe('useDeletePot', () => {
  it('D-101 every pot action is one undo step with its label (delete)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1')]);
    fake.respondWith(ok([pot('p1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useDeletePot(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(pot('p1'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)).toEqual([]);

    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string };
    expect(Object.keys(patch)).toEqual(['deleted_at']);
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'potDeleted',
      labelParams: { name: 'Car service' },
      ops: [{ entity: 'savings_goals', expectedVersion: 2, patch: { deleted_at: null } }],
    });
  });

  it('D-101 a Wait goal is not deletable here', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useDeletePot(), { wrapper: wrapper(qc) });
    expect(() => result.current.remove(pot('w1', { kind: 'wait', check_id: 'k1' }))).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('useSetPotDone', () => {
  it('D-101 every pot action is one undo step with its label (done and reopen)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [pot('p1')]);
    fake.respondWith(ok([pot('p1', { done_at: '2026-10-02T00:00:00Z', version: 2 })]));
    fake.respondWith(ok([pot('p1', { done_at: null, version: 3 })]));
    const { result } = await renderHook(() => useSetPotDone(), { wrapper: wrapper(qc) });

    result.current.setDone(pot('p1'), true);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ done_at: expect.any(String) });
    expect(lastStep()).toMatchObject({
      labelKey: 'potDone',
      ops: [{ entity: 'savings_goals', id: 'p1', expectedVersion: 2, patch: { done_at: null } }],
    });
    // still in the list (a done pot is shown in the Done fold), with done_at set
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]?.done_at).toBe('2026-10-02T00:00:00Z');

    result.current.setDone(pot('p1', { done_at: '2026-10-02T00:00:00Z', version: 2 }), false);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));
    expect(lastStep()).toMatchObject({
      labelKey: 'potReopened',
      ops: [{ id: 'p1', expectedVersion: 3, patch: { done_at: '2026-10-02T00:00:00Z' } }],
    });
  });

  it('D-101 a Wait goal can be marked done', async () => {
    const { fake, qc } = setup();
    const wait = pot('w1', { kind: 'wait', check_id: 'k1', monthly_amount: 5000 });
    fake.respondWith(ok([{ ...wait, done_at: '2026-10-02T00:00:00Z', version: 2 }]));
    const { result } = await renderHook(() => useSetPotDone(), { wrapper: wrapper(qc) });
    result.current.setDone(wait, true);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep().labelKey).toBe('potDone');
  });
});

describe('offline', () => {
  it('D-101 paused pot writes replay in order after reconnect', async () => {
    const first = setup();
    onlineManager.setOnline(false);
    try {
      const add = await renderHook(() => useAddPot(), { wrapper: wrapper(first.qc) });
      const edit = await renderHook(() => useEditPot(), { wrapper: wrapper(first.qc) });
      const done = await renderHook(() => useSetPotDone(), { wrapper: wrapper(first.qc) });
      const { id } = add.result.current.add({ householdId: 'hh-1', ownerId: 'user-1', pot: NEW_POT });
      // the cache row feeds the snapshot at once, while offline
      await waitFor(() => expect(first.qc.getQueryData<SavingsGoalRow[]>(KEY)?.map((r) => r.id)).toEqual([id]));
      const optimistic = first.qc.getQueryData<SavingsGoalRow[]>(KEY)![0]!;
      edit.result.current.edit(optimistic, { target: 72000 });
      done.result.current.setDone({ ...optimistic, target: 72000 }, true);
      await waitFor(() => expect(first.qc.getMutationCache().getAll()).toHaveLength(3));
      await waitFor(() => expect(first.qc.getMutationCache().getAll().every((m) => m.state.isPaused)).toBe(true));

      // restart: persisted variables are plain JSON
      const persisted = JSON.parse(JSON.stringify(dehydrate(first.qc))) as ReturnType<typeof dehydrate>;
      first.qc.clear();
      clearVersionChains();
      const second = setup();
      hydrate(second.qc, persisted);
      second.fake.respondWith(ok(pot(id)));
      second.fake.respondWith(ok([pot(id, { target: 72000, version: 2 })]));
      second.fake.respondWith(ok([pot(id, { target: 72000, done_at: '2026-10-02T00:00:00Z', version: 3 })]));
      onlineManager.setOnline(true);
      await second.qc.resumePausedMutations();
      await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(3));

      const writes = second.fake.calls.filter((c) => c.method === 'insert' || c.method === 'update').map((c) => c.method);
      expect(writes).toEqual(['insert', 'update', 'update']);
      expect(insertUndoStep.mock.calls.map((c) => (c[1] as Step).labelKey)).toEqual(['potAdded', 'potEdited', 'potDone']);
      // the second write is conditional on the version the first one left behind
      expect(second.fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version' && c.args[1] === 2)).toBe(true);
      expect(recordFailedWrite).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
