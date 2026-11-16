// 08-15 (HH-04..HH-06, D-14): sharing writes queue offline, replay version-checked, and name who changed a line first.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { VersionConflictError } from '@/db/errors';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import {
  HouseholdRejectedError,
  registerHouseholdSharingMutations,
  splitUndoVars,
  unwrapRpc,
  useMakeLinePrivate,
  useSetLineSplit,
  useSetMyLineCategory,
  useSetPaidBy,
  useShareLine,
} from '../householdSharing';
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

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function line(over: Partial<TransactionRow> = {}): TransactionRow {
  return { id: 't1', household_id: HH, version: 3, is_shared: false, split_rule: null, paid_by: null, ...over } as TransactionRow;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerHouseholdSharingMutations(qc);
  qc.setQueryData(MONTH_KEY, [line()]);
  return { fake, qc };
}

const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').map((c) => c.args);

beforeEach(() => {
  clearVersionChains();
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
});

describe('unwrapRpc', () => {
  it('returns a success, and turns refusals into typed errors', () => {
    expect(unwrapRpc({ ok: true, version: 4 }, 't1')).toMatchObject({ ok: true, version: 4 });
    expect(() => unwrapRpc({ ok: false, reason: 'line_locked' }, 't1')).toThrow(HouseholdRejectedError);
    try {
      unwrapRpc({ ok: false, reason: 'version_conflict', current_version: 9, updated_by: 'sam' }, 't1');
    } catch (e) {
      expect(e).toBeInstanceOf(VersionConflictError);
      expect((e as VersionConflictError).serverRow).toEqual({ version: 9, updated_by: 'sam' });
    }
    try {
      unwrapRpc({ ok: false, reason: 'joint_account_line' }, 't1');
    } catch (e) {
      expect((e as HouseholdRejectedError).code).toBe('joint_account_line');
    }
  });
});

describe('useShareLine', () => {
  it('marks the line shared in the cache at once, sends the version, and refreshes the month and balances', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, shared_count: 1, version: 4 }));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useShareLine(), { wrapper: wrapper(qc) });

    await act(async () => {

      result.current.mutate({ ...base, rule: 'weight' });

    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]).toEqual([
      'share_transaction',
      { p_id: 't1', p_expected_version: 3, p_rule: 'weight', p_participants: null, p_amounts: null, p_series_scope: 'one' },
    ]);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.householdBalances(HH) }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MONTH_KEY });
  });

  it('chains the version so two quick changes to one line do not clash with each other', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, shared_count: 1, version: 4 }));
    fake.respondWith(ok({ ok: true, version: 5 }));
    const { result } = await renderHook(() => ({ share: useShareLine(), priv: useMakeLinePrivate() }), { wrapper: wrapper(qc) });

    await act(async () => {

      result.current.share.mutate(base);

    });
    await act(async () => {
      result.current.priv.mutate(base);
    }); // same stale base version 3
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(2));
    expect(rpcCalls(fake)[1]).toEqual(['make_line_private', { p_id: 't1', p_expected_version: 4 }]);
  });

  it('keeps the write waiting while offline and sends it on reconnect (UI-SPEC offline rule)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4 }));
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useShareLine(), { wrapper: wrapper(qc) });

    await act(async () => {

      result.current.mutate(base);

    });
    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(rpcCalls(fake)).toHaveLength(0);
    expect(qc.getQueryData<TransactionRow[]>(MONTH_KEY)?.[0]).toMatchObject({ is_shared: true, pending: true });

    onlineManager.setOnline(true);
    await act(async () => {
      await qc.resumePausedMutations();
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  });

  it('parks a refusal with its reason, sends it once, and re-reads the month', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'line_locked' }));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useShareLine(), { wrapper: wrapper(qc) });

    await act(async () => {

      result.current.mutate(base);

    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'transactions', entityId: 't1', kind: 'rejected', code: 'line_locked' });
    expect(rpcCalls(fake)).toHaveLength(1); // never retried
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MONTH_KEY });
  });

  it('records who changed the line first on a version conflict (D-14)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'version_conflict', current_version: 7, updated_by: 'sam' }));
    const { result } = await renderHook(() => useShareLine(), { wrapper: wrapper(qc) });

    await act(async () => {

      result.current.mutate(base);

    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'transactions',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'shareLine', updated_by: 'sam' },
    });
    expect(rpcCalls(fake)).toHaveLength(1);
  });

  it('treats not_found as a missing line', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: false, reason: 'not_found' }));
    const { result } = await renderHook(() => useShareLine(), { wrapper: wrapper(qc) });
    await act(async () => {
      result.current.mutate(base);
    });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'not-found' });
  });
});

describe('the other queued sharing writes', () => {
  it('makes a line private, sets paid by and splits, with the server argument names', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ ok: true, version: 4 }));
    fake.respondWith(ok({ ok: true, version: 5 }));
    fake.respondWith(ok({ ok: true, version: 6, before: { rule: 'even', participants: ['me', 'sam'], shares: { me: -500, sam: -500 } } }));
    const { result } = await renderHook(
      () => ({ priv: useMakeLinePrivate(), paid: useSetPaidBy(), split: useSetLineSplit() }),
      { wrapper: wrapper(qc) },
    );

    await act(async () => {

      result.current.priv.mutate(base);

    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    await act(async () => {
      result.current.paid.mutate({ ...base, expectedVersion: 4, userId: 'sam' });
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(2));
    await act(async () => {
      result.current.split.mutate({ ...base, expectedVersion: 5, rule: 'mine', participants: ['me'] });
    });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(3));

    expect(rpcCalls(fake).map((a) => a[0])).toEqual(['make_line_private', 'set_paid_by', 'set_line_split']);
    expect(rpcCalls(fake)[1]![1]).toEqual({ p_id: 't1', p_expected_version: 4, p_user: 'sam' });
    expect(rpcCalls(fake)[2]![1]).toMatchObject({ p_rule: 'mine', p_participants: ['me'], p_amounts: null });
  });

  it('a split change resolves with the server before-split, and splitUndoVars sends it back at the new version', async () => {
    const { fake, qc } = setup();
    const before = { rule: 'amount' as const, participants: ['me', 'sam'], shares: { me: -300, sam: -700 } };
    fake.respondWith(ok({ ok: true, version: 6, before }));
    const { result } = await renderHook(() => useSetLineSplit(), { wrapper: wrapper(qc) });

    let undo: ReturnType<typeof splitUndoVars> = null;
    await act(async () => {
      result.current.mutate(
        { ...base, rule: 'even', participants: ['me', 'sam'] },
        { onSuccess: (res) => (undo = splitUndoVars(base, res)) }
      );
    });
    await waitFor(() => expect(undo).not.toBeNull());
    expect(undo).toEqual({
      householdId: HH,
      month: MONTH,
      id: 't1',
      expectedVersion: 6,
      rule: 'amount',
      participants: ['me', 'sam'],
      amounts: { me: -300, sam: -700 },
    });
  });

  it('splitUndoVars gives nothing to undo when the server reported no earlier split', () => {
    expect(splitUndoVars(base, { version: 4, before: null })).toBeNull();
    expect(splitUndoVars(base, { version: 4, before: { rule: null, participants: [], shares: {} } })).toBeNull();
    expect(splitUndoVars(base, { version: null, before: { rule: 'even', participants: ['a'], shares: {} } })).toBeNull();
  });

  it('writes only the caller own category row, and clears it with null', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(null));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSetMyLineCategory(), { wrapper: wrapper(qc) });
    const vars = { householdId: HH, month: MONTH, userId: 'me', transactionId: 't1' };

    await act(async () => {

      result.current.mutate({ ...vars, categoryId: 'c1' });

    });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({
      transaction_id: 't1',
      user_id: 'me',
      household_id: HH,
      category_id: 'c1',
    });
    await act(async () => {
      result.current.mutate({ ...vars, categoryId: null });
    });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'delete')).toBe(true));
  });
});
