// D-88: one queued draft save per check, with the queue order and the version chain kept.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys, mutationKeys } from '@/data/keys';
import { clearVersionChains, resolveExpectedVersion } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { coalesceDraftSave } from '../coalesceDrafts';
import {
  registerDecideCheckMutations,
  useAbandonCheck,
  useCreateCheck,
  useSaveCheckDraft,
} from '@/data/mutations/decideChecks';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'id-1') }));
jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
  dismissFailedWrite: jest.fn(async () => undefined),
}));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const check = (id: string, overrides: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({
    id,
    household_id: 'hh-1',
    created_by: 'user-1',
    kind: 'buy',
    name: 'Laptop',
    inputs: { kind: 'buy' },
    status: 'open',
    furthest_step: 1,
    deleted_at: null,
    version: 1,
    ...overrides,
  }) as unknown as DecideCheckRow;

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideCheckMutations(qc);
  return { fake, qc };
}

const keysQueued = (qc: QueryClient): string[] =>
  qc
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === 'pending')
    .map((m) => String((m.options.mutationKey ?? [])[1]));

beforeEach(() => {
  clearVersionChains();
  resetToastForTests();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('coalesceDraftSave', () => {
  it('D-88 a paused create, save, save then delete replays as create, save, delete', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.decideChecks('user-1', 'hh-1'), [check('k1', { version: 1 })]);
    onlineManager.setOnline(false);

    const create = await renderHook(() => useCreateCheck(), { wrapper: wrapper(qc) });
    const save = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });
    const abandon = await renderHook(() => useAbandonCheck(), { wrapper: wrapper(qc) });

    create.result.current.create({ userId: 'user-1', id: 'k1', householdId: 'hh-1', kind: 'buy', name: 'A', inputs: { kind: 'buy' }, furthestStep: 1 });
    await waitFor(() => expect(keysQueued(qc)).toEqual(['create']));
    save.result.current.save({ id: 'k1', name: 'AB', inputs: { kind: 'buy' }, furthestStep: 1 });
    await waitFor(() => expect(keysQueued(qc)).toEqual(['create', 'save-draft']));
    save.result.current.save({ id: 'k1', name: 'ABC', inputs: { kind: 'buy' }, furthestStep: 2 });
    // the older, unsent save is gone: one save is queued
    await waitFor(() => expect(keysQueued(qc)).toEqual(['create', 'save-draft']));
    expect(qc.getMutationCache().getAll()).toHaveLength(2);
    abandon.result.current.abandon(check('k1', { version: 1 }));
    await waitFor(() => expect(keysQueued(qc)).toEqual(['create', 'save-draft', 'edit']));

    fake.respondWith(ok(check('k1', { name: 'A' }))); // create insert
    fake.respondWith(ok([check('k1', { name: 'ABC', furthest_step: 2, version: 2 })])); // the one save
    fake.respondWith(ok([check('k1', { deleted_at: '2026-10-23T00:00:00Z', version: 3 })])); // delete
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(qc.getMutationCache().getAll().every((m) => m.state.status === 'success')).toBe(true));

    const writes = fake.calls.filter((c) => c.method === 'insert' || c.method === 'update');
    expect(writes.map((c) => c.method)).toEqual(['insert', 'update', 'update']);
    // the save that travelled carries the latest inputs only
    expect(writes[1]!.args[0]).toMatchObject({ name: 'ABC', furthest_step: 2 });
    expect(writes[2]!.args[0]).toMatchObject({ deleted_at: expect.any(String) });
    // WR-A03: the abandon was built on version 1, the save moved it to 2, so it is sent at 2
    const versionFilters = fake.calls.filter((c) => c.method === 'eq' && c.args[0] === 'version').map((c) => c.args[1]);
    expect(versionFilters).toEqual([2]);
  });

  it('D-88 keeps only the latest of three offline saves and keeps the version chain', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.decideChecks('user-1', 'hh-1'), [check('k1', { version: 3 })]);
    onlineManager.setOnline(false);
    const save = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });
    for (const name of ['a', 'ab', 'abc']) {
      save.result.current.save({ id: 'k1', name, inputs: { kind: 'buy' }, furthestStep: 1 });
      await waitFor(() => expect(qc.getMutationCache().getAll().some((m) => (m.state.variables as { name?: string }).name === name)).toBe(true));
    }
    expect(qc.getMutationCache().getAll()).toHaveLength(1);

    fake.respondWith(ok([check('k1', { name: 'abc', version: 4 })]));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(1);
    expect(resolveExpectedVersion('decide_checks', 'k1', 3)).toBe(4);
  });

  it('D-88 leaves a save in flight alone and a save of another check alone', async () => {
    const { qc } = setup();
    // an in-flight (not paused) save: the first request never answers
    const fake = mockActiveClient as FakeSupabase;
    fake.sessionGate = new Promise<void>(() => undefined);
    const save = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });
    save.result.current.save({ id: 'k1', name: 'one', inputs: {}, furthestStep: 1 });
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state).toMatchObject({ status: 'pending', isPaused: false }));
    save.result.current.save({ id: 'k2', name: 'other', inputs: {}, furthestStep: 1 });
    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(2));

    expect(coalesceDraftSave(qc, 'k1')).toBe(0); // k1's is in flight
    expect(coalesceDraftSave(qc, 'k2')).toBe(1); // k2's is waiting behind it, and nothing newer yet exists
    expect(qc.getMutationCache().findAll({ mutationKey: mutationKeys.saveCheckDraft })).toHaveLength(1);
  });

  it('D-88 does not move a save behind a queued delete of its check', async () => {
    const { qc } = setup();
    qc.setQueryData(queryKeys.decideChecks('user-1', 'hh-1'), [check('k1', { version: 1 })]);
    onlineManager.setOnline(false);
    const save = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });
    const abandon = await renderHook(() => useAbandonCheck(), { wrapper: wrapper(qc) });
    save.result.current.save({ id: 'k1', name: 'x', inputs: {}, furthestStep: 1 });
    await waitFor(() => expect(keysQueued(qc)).toEqual(['save-draft']));
    abandon.result.current.abandon(check('k1', { version: 1 }));
    await waitFor(() => expect(keysQueued(qc)).toEqual(['save-draft', 'edit']));

    expect(coalesceDraftSave(qc, 'k1')).toBe(0);
    expect(keysQueued(qc)).toEqual(['save-draft', 'edit']);
  });
});
