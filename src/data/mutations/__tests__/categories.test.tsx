// 02-17 Task 1: category add / edit / archive / merge through the write queue, each one
// undoable step (REC-07, D-34, D-35, D-36), plus the usage-count query.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { CategoryRow, DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useCategoryUsage } from '@/data/queries/categories';
import {
  registerCategoryMutations,
  useAddCategory,
  useArchiveCategory,
  useEditCategory,
  useMergeCategory,
} from '../categories';
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

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerCategoryMutations(qc);
  return qc;
}

const cat = (id: string, overrides: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  owner_id: 'user-1',
  builtin_key: null,
  name: id,
  color_key: 'green',
  is_system: false,
  archived_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; labelParams: unknown; ops: { expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAddCategory', () => {
  it('inserts optimistically and records a categoryAdded step that archives it at version 1', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(cat('id-1', { name: 'Pets', color_key: 'blue' })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddCategory(), { wrapper: wrapper(qc) });

    const out = result.current.add({ ownerId: 'user-1', name: 'Pets', colorKey: 'blue' });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    const insert = fake.calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ id: 'id-1', name: 'Pets', color_key: 'blue' });
    expect(lastStep()).toMatchObject({
      id: 'id-2',
      labelKey: 'categoryAdded',
      labelParams: { name: 'Pets' },
      ops: [{ entity: 'categories', id: 'id-1', expectedVersion: 1, patch: { archived_at: '$now' } }],
    });
    expect(qc.getQueryData<CategoryRow[]>(queryKeys.categories('user-1'))?.map((r) => r.id)).toContain('id-1');
  });
});

describe('useEditCategory / useArchiveCategory', () => {
  it('rename + recolour patches with a version check and the step restores the previous values', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('c1', { name: 'Fun', color_key: 'rust', version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });

    result.current.edit(cat('c1', { name: 'Hobbies', color_key: 'green' }), { name: 'Fun', colorKey: 'rust' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Fun', color_key: 'rust' });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 1]);
    expect(lastStep()).toMatchObject({
      labelKey: 'categoryEdited',
      ops: [{ expectedVersion: 2, patch: { name: 'Hobbies', color_key: 'green' } }],
    });
  });

  it('allows a built-in (not system) category to be renamed; its null name is restored as null', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('b1', { builtin_key: 'Groceries', name: 'Food', version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });

    result.current.edit(cat('b1', { builtin_key: 'Groceries', name: null }), { name: 'Food' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep().ops[0]).toMatchObject({ patch: { name: null } });
  });

  it('archive patches archived_at and restore clears it, each as one step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('c1', { archived_at: '2026-09-02T00:00:00Z', version: 2 })]));
    fake.respondWith(ok([cat('c1', { archived_at: null, version: 3 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useArchiveCategory(), { wrapper: wrapper(qc) });

    const archiveStep = result.current.archive(cat('c1'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(lastStep()).toMatchObject({ id: archiveStep, labelKey: 'categoryArchived', ops: [{ expectedVersion: 2, patch: { archived_at: null } }] });
    const archivePatch = fake.calls.find((c) => c.method === 'update')?.args[0] as { archived_at: string };
    expect(typeof archivePatch.archived_at).toBe('string');

    const restoreStep = result.current.restore(cat('c1', { archived_at: '2026-09-02T00:00:00Z', version: 2 }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));
    expect(lastStep()).toMatchObject({
      id: restoreStep,
      labelKey: 'categoryEdited',
      ops: [{ expectedVersion: 3, patch: { archived_at: '2026-09-02T00:00:00Z' } }],
    });
  });

  it('throws TypeError before mutating for a system category', async () => {
    mockActiveClient = createFakeSupabase();
    const qc = newClient();
    const edit = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });
    const archive = await renderHook(() => useArchiveCategory(), { wrapper: wrapper(qc) });
    const system = cat('t', { is_system: true, builtin_key: 'Transfer' });

    expect(() => edit.result.current.edit(system, { name: 'x' })).toThrow(TypeError);
    expect(() => archive.result.current.archive(system)).toThrow(TypeError);
    expect(() => archive.result.current.restore(system)).toThrow(TypeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('useMergeCategory', () => {
  const vars = {
    source: cat('src', { version: 4 }),
    target: cat('dst'),
    targetName: 'Dining',
    householdId: 'h1',
    ownerId: 'user-1',
  };

  it('moves every active transaction and archives the source in one apply_patches call carrying its undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([
      { id: 't1', version: 2, local_date: '2026-09-01' },
      { id: 't2', version: 5, local_date: '2026-08-01' },
    ]));
    fake.respondWith(
      ok({
        status: 'applied',
        rows: [
          { entity: 'transactions', id: 't1', version: 3 },
          { entity: 'transactions', id: 't2', version: 6 },
          { entity: 'categories', id: 'src', version: 5 },
        ],
      })
    );
    const qc = newClient();
    qc.setQueryData(queryKeys.categories('user-1'), [cat('src', { version: 4 }), cat('dst')]);
    const { result } = await renderHook(() => useMergeCategory(), { wrapper: wrapper(qc) });

    const stepId = result.current.merge(vars);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));

    const rpc = fake.calls.find((c) => c.method === 'rpc')!;
    expect(rpc.args[0]).toBe('apply_patches');
    const args = rpc.args[1] as { p_ops: unknown[]; p_undo_step: { id: string; label_key: string; label_params: unknown; ops: { expectedVersion: number }[] } };
    expect(args.p_ops).toEqual([
      { entity: 'transactions', id: 't1', expectedVersion: 2, patch: { category_id: 'dst' } },
      { entity: 'transactions', id: 't2', expectedVersion: 5, patch: { category_id: 'dst' } },
      { entity: 'categories', id: 'src', expectedVersion: 4, patch: { archived_at: '$now' } },
    ]);
    expect(args.p_undo_step).toMatchObject({ id: stepId, label_key: 'categoryMerged', label_params: { name: 'Dining' } });
    expect(args.p_undo_step.ops.map((o) => o.expectedVersion)).toEqual([3, 6, 5]); // inverse ops expect the version the forward write leaves behind
    // The source is archived optimistically, before the server answers.
    expect(qc.getQueryData<CategoryRow[]>(queryKeys.categories('user-1'))?.find((c) => c.id === 'src')?.archived_at).not.toBeNull();
  });

  it('merges an unused category by archiving it alone', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([]));
    fake.respondWith(ok({ status: 'applied', rows: [{ entity: 'categories', id: 'src', version: 5 }] }));
    const qc = newClient();
    const { result } = await renderHook(() => useMergeCategory(), { wrapper: wrapper(qc) });

    result.current.merge(vars);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = fake.calls.find((c) => c.method === 'rpc')!.args[1] as { p_ops: unknown[] };
    expect(args.p_ops).toHaveLength(1);
  });

  it('refuses over 6000 rows as a rejected failed write and sends nothing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(Array.from({ length: 6001 }, (_, i) => ({ id: `t${i}`, version: 1, local_date: '2026-09-01' }))));
    const qc = newClient();
    const { result } = await renderHook(() => useMergeCategory(), { wrapper: wrapper(qc) });

    result.current.merge(vars);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'categories', entityId: 'src', kind: 'rejected', code: 'merge-too-large' })
    );
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
  });

  it('refuses whole on a conflict with a refusal toast and a conflict failed write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([{ id: 't1', version: 2, local_date: '2026-09-01' }]));
    const conflict = { entity: 'transactions', id: 't1', updated_by: 'sam', record_name: 'Lunch', builtin_key: null, reason: 'changed' };
    fake.respondWith(ok({ status: 'conflict', conflict }));
    const qc = newClient();
    const { result } = await renderHook(() => useMergeCategory(), { wrapper: wrapper(qc) });

    result.current.merge(vars);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict', entityId: 't1' }));
    expect(getToast()).toMatchObject({ kind: 'refusal' });
  });

  it('throws TypeError before mutating when source is target, or the target is archived or system', async () => {
    mockActiveClient = createFakeSupabase();
    const qc = newClient();
    const { result } = await renderHook(() => useMergeCategory(), { wrapper: wrapper(qc) });

    expect(() => result.current.merge({ ...vars, target: vars.source })).toThrow(TypeError);
    expect(() => result.current.merge({ ...vars, target: cat('dst', { archived_at: '2026-09-01T00:00:00Z' }) })).toThrow(TypeError);
    expect(() => result.current.merge({ ...vars, target: cat('dst', { is_system: true }) })).toThrow(TypeError);
    expect(() => result.current.merge({ ...vars, source: cat('src', { is_system: true }) })).toThrow(TypeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('useCategoryUsage', () => {
  it('returns the active-row count, and caps the display at 6000', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([{ id: 'a', version: 1, local_date: '2026-09-01' }, { id: 'b', version: 1, local_date: '2026-09-01' }]));
    const qc = newClient();
    const first = await renderHook(() => useCategoryUsage('h1', 'c1', true), { wrapper: wrapper(qc) });
    await waitFor(() => expect(first.result.current.count).toBe(2));
    expect(first.result.current.capped).toBe(false);

    fake.respondWith(ok(Array.from({ length: 6001 }, (_, i) => ({ id: `t${i}`, version: 1, local_date: '2026-09-01' }))));
    const second = await renderHook(() => useCategoryUsage('h1', 'c2', true), { wrapper: wrapper(qc) });
    await waitFor(() => expect(second.result.current.capped).toBe(true));
    expect(second.result.current.count).toBe(6000);
  });

  it('does not query while disabled', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useCategoryUsage('h1', 'c1', false), { wrapper: wrapper(qc) });
    expect(result.current.count).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});
