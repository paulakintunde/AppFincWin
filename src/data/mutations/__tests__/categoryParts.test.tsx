// 10.1-11 (SPL-01): saving a line's parts waits in the offline queue, patches the cached line at once, keeps the server's
// before-state for Undo, and reports who changed the line first on a version conflict.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { partsUndoVars, registerCategoryPartsDefaults, useSetCategoryParts } from '../categoryParts';
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

const HH = 'hh-1';
const MONTH = '2026-11';
const MONTH_KEY = queryKeys.transactionsMonth(HH, MONTH);
const base = { householdId: HH, month: MONTH, id: 't1', expectedVersion: 3 };
const PARTS = [
  { categoryId: 'a', amount: -3000 },
  { categoryId: 'b', amount: -2000 },
];

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerCategoryPartsDefaults(qc);
  qc.setQueryData(MONTH_KEY, [
    { id: 't1', household_id: HH, version: 3, original_amount: -5000, category_id: 'x', category_parts: null } as unknown as TransactionRow,
  ]);
  return { fake, qc };
}

const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').map((c) => c.args);

beforeEach(() => {
  clearVersionChains();
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
});

describe('useSetCategoryParts', () => {
  it('sends the version and the stored parts and resolves with the before-state', async () => {
    const { fake, qc } = setup();
    const before = { parts: null, category_id: 'x' };
    fake.respondWith(ok({ ok: true, version: 4, before }));
    const { result } = await renderHook(() => useSetCategoryParts(), { wrapper: wrapper(qc) });

    let res: { version: number | null; before: unknown } | undefined;
    await act(async () => {
      result.current.mutate({ ...base, parts: PARTS }, { onSuccess: (r) => (res = r) });
    });
    await waitFor(() => expect(res).toBeDefined());

    expect(rpcCalls(fake)[0]).toEqual([
      'set_category_parts',
      { p_id: 't1', p_expected_version: 3, p_parts: [{ c: 'a', a: -3000 }, { c: 'b', a: -2000 }], p_keep_as: null },
    ]);
    expect(res).toEqual({ version: 4, before });
  });

  it('shows the parts in the cache while queued offline, then sends them on reconnect', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4, before: { parts: null, category_id: 'x' } }));
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSetCategoryParts(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate({ ...base, parts: PARTS });
    });
    await waitFor(() => {
      const row = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(MONTH_KEY)![0]!;
      expect(row.category_parts).toEqual([{ c: 'a', a: -3000 }, { c: 'b', a: -2000 }]);
      expect(row.category_id).toBe('a');
      expect(row.pending).toBe(true);
    });
    expect(rpcCalls(fake)).toHaveLength(0);
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  });

  it('removing the split sends null parts and the category to keep', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4, before: { parts: [{ c: 'a', a: -3000 }], category_id: 'a' } }));
    const { result } = await renderHook(() => useSetCategoryParts(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate({ ...base, parts: null, keepAs: 'b' });
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]![1]).toMatchObject({ p_parts: null, p_keep_as: 'b' });
  });

  it('records who changed the line first on a version conflict and refreshes the month', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'version_conflict', current_version: 7, updated_by: 'sam' }));
    const { result } = await renderHook(() => useSetCategoryParts(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    await act(async () => {
      result.current.mutate({ ...base, parts: PARTS });
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'transactions',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'setCategoryParts', updated_by: 'sam' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MONTH_KEY });
    expect(rpcCalls(fake)).toHaveLength(1);
  });

  it('turns any other refusal into a rejected write with the reason as its code', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'parts_invalid', detail: 'not_total' }));
    const { result } = await renderHook(() => useSetCategoryParts(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate({ ...base, parts: PARTS });
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'rejected', code: 'parts_invalid' });
  });
});

describe('partsUndoVars', () => {
  it('sends the before-state back at the new version', () => {
    expect(
      partsUndoVars(base, { version: 4, before: { parts: [{ c: 'a', a: -3000 }, { c: null, a: -2000, l: 'taxTip' }], category_id: 'a' } })
    ).toEqual({
      householdId: HH,
      month: MONTH,
      id: 't1',
      expectedVersion: 4,
      parts: [
        { categoryId: 'a', amount: -3000, label: null },
        { categoryId: null, amount: -2000, label: 'taxTip' },
      ],
      keepAs: 'a',
    });
  });

  it('a line that had no parts undoes to null parts keeping its old category', () => {
    expect(partsUndoVars(base, { version: 4, before: { parts: null, category_id: 'x' } })).toMatchObject({ parts: null, keepAs: 'x' });
  });

  it('gives nothing to undo without a before-state or version', () => {
    expect(partsUndoVars(base, { version: 4, before: null })).toBeNull();
    expect(partsUndoVars(base, { version: null, before: { parts: null, category_id: null } })).toBeNull();
  });
});
