// 10.1-26 (D-17): splitting a shared line by item waits in the offline queue, patches the cached line at once, keeps the
// server's before-state for Undo, and reports who changed the line first on a version conflict. Undo goes to
// restore_line_split with that before-state.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import type { ItemSplitBefore } from '@/db/itemSplit';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { VersionConflictError } from '@/db/errors';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import {
  registerItemSplitDefaults,
  restoreSplitVars,
  useRestoreLineSplit,
  useSetSplitByItem,
  type SetSplitByItemResult,
  type SetSplitByItemVars,
} from '../itemSplit';
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
const VARS: SetSplitByItemVars = {
  householdId: HH,
  month: MONTH,
  id: 't1',
  expectedVersion: 3,
  items: [
    { name: 'Oat milk', price: 3000, discount: 0, c: 'a', people: ['u1'] },
    { name: 'Bread', price: 2000, discount: 0, c: 'b', people: ['u1', 'u2'] },
  ],
  extras: { tax: 0, tip: 0, discounts: 0 },
  parts: [
    { categoryId: 'a', amount: -3000 },
    { categoryId: 'b', amount: -2000 },
  ],
  category: null,
  store: 'Shop',
  date: '2026-11-20',
};
const BEFORE: ItemSplitBefore = {
  split: { rule: 'even', participants: ['u1', 'u2'], shares: { u1: 2500, u2: 2500 } },
  rule: 'even',
  manual: false,
  parts: null,
  category_id: 'x',
  item_split: null,
};

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
  registerItemSplitDefaults(qc);
  qc.setQueryData(MONTH_KEY, [
    {
      id: 't1',
      household_id: HH,
      version: 3,
      original_amount: -5000,
      category_id: 'x',
      category_parts: null,
      is_shared: true,
      split_rule: 'even',
      split_manual: false,
    } as unknown as TransactionRow,
  ]);
  return { fake, qc };
}

const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').map((c) => c.args);
const row = (qc: QueryClient) => qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(MONTH_KEY)![0]!;

beforeEach(() => {
  clearVersionChains();
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
});

describe('useSetSplitByItem', () => {
  it('sends the items, extras and parts with the version and resolves with the before-state and shares', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4, before: BEFORE, shares: { u1: 4000, u2: 1000 } }));
    const { result } = await renderHook(() => useSetSplitByItem(), { wrapper: wrapper(qc) });

    let res: SetSplitByItemResult | undefined;
    await act(async () => {
      result.current.mutate(VARS, { onSuccess: (r) => (res = r) });
    });
    await waitFor(() => expect(res).toBeDefined());

    expect(rpcCalls(fake)[0]).toEqual([
      'set_split_by_item',
      {
        p_id: 't1',
        p_expected_version: 3,
        p_items: VARS.items,
        p_extras: VARS.extras,
        p_parts: [
          { c: 'a', a: -3000 },
          { c: 'b', a: -2000 },
        ],
        p_category: null,
        p_store: 'Shop',
        p_date: '2026-11-20',
      },
    ]);
    expect(res).toEqual({ version: 4, before: BEFORE, shares: { u1: 4000, u2: 1000 } });
  });

  it('patches the cached line while queued offline, then sends on reconnect', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4, before: BEFORE }));
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSetSplitByItem(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate(VARS);
    });
    await waitFor(() => {
      const r = row(qc);
      expect(r.split_rule).toBe('amount');
      expect(r.split_manual).toBe(true);
      expect(r.category_parts).toEqual([
        { c: 'a', a: -3000 },
        { c: 'b', a: -2000 },
      ]);
      expect(r.category_id).toBe('a');
      expect(r.pending).toBe(true);
    });
    expect(rpcCalls(fake)).toHaveLength(0);
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  });

  it('with one category the cached line drops its parts and takes the category', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4, before: BEFORE }));
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSetSplitByItem(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate({ ...VARS, parts: null, category: 'b' });
    });
    await waitFor(() => expect(row(qc).category_id).toBe('b'));
    expect(row(qc).category_parts).toBeNull();
  });

  it('a version conflict reaches the caller with who changed the line, and is parked', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'version_conflict', current_version: 7, updated_by: 'sam' }));
    const { result } = await renderHook(() => useSetSplitByItem(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    let caught: unknown;
    await act(async () => {
      result.current.mutate(VARS, { onError: (e) => (caught = e) });
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    await waitFor(() => expect(caught).toBeInstanceOf(VersionConflictError));
    expect((caught as VersionConflictError).serverRow).toMatchObject({ updated_by: 'sam' });
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'transactions',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'setSplitByItem', updated_by: 'sam' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MONTH_KEY });
  });

  it('any other refusal is parked with its reason', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'items_not_total', diff: 20 }));
    const { result } = await renderHook(() => useSetSplitByItem(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate(VARS);
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'rejected', code: 'items_not_total' });
  });
});

describe('useRestoreLineSplit', () => {
  it('sends the before-state to restore_line_split and puts it back in the cache at once', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 5 }));
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useRestoreLineSplit(), { wrapper: wrapper(qc) });
    const undo = restoreSplitVars(VARS, { version: 4, before: BEFORE, shares: null })!;
    await act(async () => {
      result.current.mutate(undo);
    });
    await waitFor(() => {
      const r = row(qc);
      expect(r.split_rule).toBe('even');
      expect(r.split_manual).toBe(false);
      expect(r.category_id).toBe('x');
      expect(r.category_parts).toBeNull();
    });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]).toEqual(['restore_line_split', { p_id: 't1', p_expected_version: 4, p_before: BEFORE }]);
  });
});

describe('restoreSplitVars', () => {
  it('sends the before-state back at the new version', () => {
    expect(restoreSplitVars(VARS, { version: 4, before: BEFORE, shares: null })).toEqual({
      householdId: HH,
      month: MONTH,
      id: 't1',
      expectedVersion: 4,
      before: BEFORE,
    });
  });

  it('gives nothing to undo without a before-state or version', () => {
    expect(restoreSplitVars(VARS, { version: 4, before: null, shares: null })).toBeNull();
    expect(restoreSplitVars(VARS, { version: null, before: BEFORE, shares: null })).toBeNull();
  });
});
