// 02.3-09: rule add / edit / remove through the write queue, each one undoable step (REC-27, D-24, D-26).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { CategoryRuleRow } from '@/db/categoryRules';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { VersionConflictError } from '@/db/errors';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerCategoryRuleMutations, useAddRule, useEditRule, useRemoveRule, type RuleCategory } from '../categoryRules';
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
  registerCategoryRuleMutations(qc);
  return qc;
}

const CACHE = { userId: 'user-1', householdId: 'hh-1' };
const KEY = queryKeys.categoryRules('user-1', 'hh-1');

const rule = (id: string, overrides: Partial<CategoryRuleRow> = {}): CategoryRuleRow => ({
  id,
  scope: 'personal',
  owner_id: 'user-1',
  household_id: null,
  created_by: 'user-1',
  keyword: 'Tesco',
  keyword_norm: 'tesco',
  category_id: 'c1',
  target_builtin_key: null,
  target_name: null,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const custom: RuleCategory = { id: 'c1', builtin_key: null, name: 'Food', is_system: false };
const builtin: RuleCategory = { id: 'g1', builtin_key: 'Groceries', name: null, is_system: false };
const gym: RuleCategory = { id: 'c2', builtin_key: null, name: 'Gym', is_system: false };

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; labelParams: unknown; ops: { expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  return { fake, qc: newClient() };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAddRule', () => {
  it('inserts a personal rule with the category id and records a ruleAdded step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(rule('id-1')));
    const { result } = await renderHook(() => useAddRule(), { wrapper: wrapper(qc) });

    const out = result.current.add({ ownerId: 'user-1', householdId: 'hh-1', scope: 'personal', keyword: 'Tesco', category: custom });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      scope: 'personal',
      household_id: null,
      keyword: 'Tesco',
      keyword_norm: 'tesco',
      category_id: 'c1',
      target_builtin_key: null,
      target_name: null,
    });
    expect(lastStep()).toMatchObject({
      id: 'id-2',
      labelKey: 'ruleAdded',
      labelParams: { name: 'Tesco' },
      ops: [{ entity: 'category_rules', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
    expect(qc.getQueryData<CategoryRuleRow[]>(KEY)?.map((r) => r.id)).toContain('id-1');
  });

  it('writes a shared rule with the built-in key, or the name for a custom category', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(rule('id-1', { scope: 'shared' })));
    fake.respondWith(ok(rule('id-3', { scope: 'shared' })));
    const { result } = await renderHook(() => useAddRule(), { wrapper: wrapper(qc) });

    result.current.add({ ownerId: 'user-1', householdId: 'hh-1', scope: 'shared', keyword: 'Aldi', category: builtin });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    result.current.add({ ownerId: 'user-1', householdId: 'hh-1', scope: 'shared', keyword: 'Pure', category: gym });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));

    const inserts = fake.calls.filter((c) => c.method === 'insert').map((c) => c.args[0]);
    expect(inserts[0]).toMatchObject({ household_id: 'hh-1', category_id: null, target_builtin_key: 'Groceries', target_name: null });
    expect(inserts[1]).toMatchObject({ household_id: 'hh-1', category_id: null, target_builtin_key: null, target_name: 'Gym' });
  });

  it('rejects a system category, an empty keyword and an over-long keyword before mutating', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useAddRule(), { wrapper: wrapper(qc) });
    const base = { ownerId: 'user-1', householdId: 'hh-1', scope: 'personal' as const };

    expect(() => result.current.add({ ...base, keyword: 'x', category: { ...custom, is_system: true } })).toThrow(TypeError);
    expect(() => result.current.add({ ...base, keyword: '   ', category: custom })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, keyword: 'a'.repeat(61), category: custom })).toThrow(RangeError);
    expect(() =>
      result.current.add({ ...base, scope: 'shared', keyword: 'x', category: { id: 't', builtin_key: 'Transfer', name: null, is_system: false } })
    ).toThrow(TypeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('rolls the optimistic row back and records a failed write on a rejection', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useAddRule(), { wrapper: wrapper(qc) });

    result.current.add({ ownerId: 'user-1', householdId: 'hh-1', scope: 'personal', keyword: 'Tesco', category: custom });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'category_rules', entityId: 'id-1' });
    expect(qc.getQueryData<CategoryRuleRow[]>(KEY)).toEqual([]);
  });
});

describe('useEditRule', () => {
  it('patches keyword and keyword_norm and the step restores the old pair', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([rule('r1', { keyword: 'Tesco Express', keyword_norm: 'tesco express', version: 2 })]));
    const { result } = await renderHook(() => useEditRule(), { wrapper: wrapper(qc) });

    result.current.edit(rule('r1'), { keyword: 'Tesco Express' }, CACHE);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ keyword: 'Tesco Express', keyword_norm: 'tesco express' });
    expect(lastStep()).toMatchObject({
      labelKey: 'ruleEdited',
      ops: [{ expectedVersion: 2, patch: { keyword: 'Tesco', keyword_norm: 'tesco' } }],
    });
  });

  it('a shared category change sends the built-in key and nulls the others; a personal one sends category_id', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([rule('r1', { scope: 'shared', version: 2 })]));
    fake.respondWith(ok([rule('r2', { version: 2 })]));
    const { result } = await renderHook(() => useEditRule(), { wrapper: wrapper(qc) });

    result.current.edit(rule('r1', { scope: 'shared', category_id: null, target_name: 'Gym' }), { category: builtin }, CACHE);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    result.current.edit(rule('r2'), { category: gym }, CACHE);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));

    const updates = fake.calls.filter((c) => c.method === 'update').map((c) => c.args[0]);
    expect(updates[0]).toEqual({ category_id: null, target_builtin_key: 'Groceries', target_name: null });
    expect(updates[1]).toEqual({ category_id: 'c2', target_builtin_key: null, target_name: null });
  });

  it('replaces the cached row with the server row on a version conflict', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [rule('r1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(rule('r1', { keyword: 'Server', version: 4 })));
    const { result } = await renderHook(() => useEditRule(), { wrapper: wrapper(qc) });

    result.current.edit(rule('r1'), { keyword: 'Mine' }, CACHE);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'conflict', entity: 'category_rules' });
    expect(qc.getQueryData<CategoryRuleRow[]>(KEY)?.[0]).toMatchObject({ keyword: 'Server', version: 4 });
    expect(VersionConflictError).toBeDefined();
  });
});

describe('useRemoveRule', () => {
  it('soft deletes with deleted_at, drops the cached row and the step restores null', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [rule('r1')]);
    fake.respondWith(ok([rule('r1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useRemoveRule(), { wrapper: wrapper(qc) });

    result.current.remove(rule('r1'), CACHE);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string };
    expect(typeof patch.deleted_at).toBe('string');
    expect(lastStep()).toMatchObject({ labelKey: 'ruleRemoved', ops: [{ expectedVersion: 2, patch: { deleted_at: null } }] });
    expect(qc.getQueryData<CategoryRuleRow[]>(KEY)).toEqual([]);
  });
});
