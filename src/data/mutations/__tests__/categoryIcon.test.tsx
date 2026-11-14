// 06.2-17 (D-07): a custom category's icon_key travels through the write queue, the optimistic cache, the undo step and
// the export manifest; anything that is not a name in our own icon set (or null) throws before any write.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { CATEGORY_COLUMNS, type CategoryRow, type DbClient } from '@/db/rows';
import { CATEGORY_INSERT_KEYS, CATEGORY_PATCH_KEYS } from '@/db/categories';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { EXPORT_MANIFEST } from '@/data/exportManifest';
import { CACHE_SCHEMA_VERSION } from '@/data/cache/persister';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { assertIconKey, registerCategoryMutations, useAddCategory, useEditCategory } from '../categories';
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
  monthly_cap: null,
  is_sample: false,
  icon_key: null,
  version: 1,
  updated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { ops: { patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  insertUndoStep.mockClear();
});

describe('categories.icon_key shape', () => {
  it('is selected, insertable, patchable and exported; the cache version moved to 10', () => {
    expect(CATEGORY_COLUMNS.split(', ')).toContain('icon_key');
    expect(CATEGORY_INSERT_KEYS).toContain('icon_key');
    expect(CATEGORY_PATCH_KEYS).toContain('icon_key');
    expect(EXPORT_MANIFEST.categories).toContain('icon_key');
    expect(CACHE_SCHEMA_VERSION).toBe('10');
  });

  it('assertIconKey allows null and names in our set, and refuses emoji, free text and unknown names', () => {
    expect(() => assertIconKey(null)).not.toThrow();
    expect(() => assertIconKey('dining')).not.toThrow();
    expect(() => assertIconKey('acctPension')).not.toThrow();
    for (const bad of ['🍕', 'my icon', 'Dining', 'notAnIcon', '', 'toString', '__proto__']) {
      expect(() => assertIconKey(bad)).toThrow(RangeError);
    }
  });
});

describe('useAddCategory icon', () => {
  it('sends icon_key and the optimistic tile carries it at once', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok(cat('id-1', { name: 'Eating out', icon_key: 'dining' })));
    const qc = newClient();
    const { result } = await renderHook(() => useAddCategory(), { wrapper: wrapper(qc) });

    // Offline: onMutate runs (optimistic tile) and the write pauses in the queue.
    onlineManager.setOnline(false);
    try {
      result.current.add({ ownerId: 'user-1', name: 'Eating out', colorKey: 'blue', iconKey: 'dining' });
      await waitFor(() =>
        expect(qc.getQueryData<CategoryRow[]>(queryKeys.categories('user-1'))?.find((r) => r.id === 'id-1')?.icon_key).toBe('dining')
      );
      expect(fake.calls.find((c) => c.method === 'insert')).toBeUndefined();
    } finally {
      onlineManager.setOnline(true);
    }
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'id-1',
      name: 'Eating out',
      color_key: 'blue',
      icon_key: 'dining',
    });
  });

  it('throws before any write for an icon outside our set', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useAddCategory(), { wrapper: wrapper(qc) });

    expect(() => result.current.add({ ownerId: 'user-1', name: 'Pizza', colorKey: 'blue', iconKey: '🍕' })).toThrow(RangeError);
    expect(fake.calls.find((c) => c.method === 'insert')).toBeUndefined();
    expect(qc.getQueryData(queryKeys.categories('user-1'))).toBeUndefined();
  });
});

describe('useEditCategory icon', () => {
  it('patches icon_key, shows it optimistically, and the undo step restores the letter tile (null)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('c1', { icon_key: 'household', version: 2 })]));
    const qc = newClient();
    qc.setQueryData(queryKeys.categories('user-1'), [cat('c1')]);
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });

    onlineManager.setOnline(false);
    try {
      result.current.edit(cat('c1'), { iconKey: 'household' });
      await waitFor(() => expect(qc.getQueryData<CategoryRow[]>(queryKeys.categories('user-1'))?.[0]?.icon_key).toBe('household'));
    } finally {
      onlineManager.setOnline(true);
    }
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ icon_key: 'household' });
    expect(lastStep().ops[0]).toMatchObject({ patch: { icon_key: null } });
  });

  it('a row read before the column existed (no icon_key) still undoes to null', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('c1', { icon_key: 'dining', version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });
    const legacy = cat('c1');
    delete legacy.icon_key;

    result.current.edit(legacy, { iconKey: 'dining' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(lastStep().ops[0]).toMatchObject({ patch: { icon_key: null } });
  });

  it('clearing the icon patches null', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok([cat('c1', { icon_key: null, version: 2 })]));
    const qc = newClient();
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });

    result.current.edit(cat('c1', { icon_key: 'dining' }), { iconKey: null });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ icon_key: null });
    expect(lastStep().ops[0]).toMatchObject({ patch: { icon_key: 'dining' } });
  });

  it('throws before any write for free text', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useEditCategory(), { wrapper: wrapper(qc) });

    expect(() => result.current.edit(cat('c1'), { iconKey: 'my icon' })).toThrow(RangeError);
    expect(fake.calls.find((c) => c.method === 'update')).toBeUndefined();
  });
});
