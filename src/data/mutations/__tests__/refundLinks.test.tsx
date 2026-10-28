// 05.2-16: refund link and unlink (one apply_patches each, one Undo).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerMutationDefaults } from '../index';
import { useLinkRefund, useUnlinkRefund } from '../refundLinks';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `step-${++mockUuid}`),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const USER = 'user-1';
const HH = 'h1';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase();
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return { fake, qc };
}

const tx = (id: string, o: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id,
    household_id: HH,
    name: 'Shop',
    original_amount: 1000,
    local_date: '2026-10-25',
    deleted_at: null,
    is_refund: false,
    refund_of: null,
    version: 1,
    ...o,
  }) as TransactionRow;

const patchedOk = (id: string, version: number) => ({
  data: { status: 'applied', rows: [{ entity: 'transactions', id, version }] },
  error: null,
  status: 200,
});

type Op = { entity: string; id: string; expectedVersion: number; patch: Record<string, unknown> };
type Args = { p_ops: Op[]; p_undo_step: { label_key: string; ops: Op[] } };
const rpcs = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

it('registers a default mutationFn for both keys', () => {
  const { qc } = setup();
  expect(qc.getMutationDefaults(mutationKeys.linkRefund).mutationFn).toBeDefined();
  expect(qc.getMutationDefaults(mutationKeys.unlinkRefund).mutationFn).toBeDefined();
});

describe('useLinkRefund', () => {
  it('sets refund_of and is_refund in one op, and the undo restores the previous values', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk('r1', 2));
    qc.setQueryData(queryKeys.transactionsMonth(HH, '2026-10'), [tx('r1')]);
    const { result } = await renderHook(() => useLinkRefund(HH, USER), { wrapper: wrapper(qc) });
    expect(result.current.link(tx('r1'), tx('p1'))).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_ops).toEqual([{ entity: 'transactions', id: 'r1', expectedVersion: 1, patch: { refund_of: 'p1', is_refund: true } }]);
    expect(args.p_undo_step.label_key).toBe('refundLinked');
    expect(args.p_undo_step.ops).toEqual([{ entity: 'transactions', id: 'r1', expectedVersion: 2, patch: { refund_of: null, is_refund: false } }]);
    expect(qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth(HH, '2026-10'))![0]).toMatchObject({ refund_of: 'p1', is_refund: true });
  });

  it('lets a second refund link to the same purchase', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk('r1', 2));
    fake.respondWith(patchedOk('r2', 2));
    const { result } = await renderHook(() => useLinkRefund(HH, USER), { wrapper: wrapper(qc) });
    result.current.link(tx('r1'), tx('p1'));
    result.current.link(tx('r2'), tx('p1'));
    await waitFor(() => expect(rpcs(fake)).toHaveLength(2));
    expect(rpcs(fake).map((c) => (c.args[1] as Args).p_ops[0]!.patch.refund_of)).toEqual(['p1', 'p1']);
  });

  it('re-pointing a linked refund undoes back to the earlier purchase', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk('r1', 4));
    const { result } = await renderHook(() => useLinkRefund(HH, USER), { wrapper: wrapper(qc) });
    result.current.link(tx('r1', { refund_of: 'old', is_refund: true, version: 3 }), tx('p2'));
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect((rpcs(fake)[0]!.args[1] as Args).p_undo_step.ops[0]!.patch).toEqual({ refund_of: 'old', is_refund: true });
  });

  it('puts the row back and records ids and field names only when the server refuses the link', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'foreign', code: '42501' }, status: 403 });
    qc.setQueryData(queryKeys.transactionsMonth(HH, '2026-10'), [tx('r1')]);
    const { result } = await renderHook(() => useLinkRefund(HH, USER), { wrapper: wrapper(qc) });
    result.current.link(tx('r1'), tx('p1'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth(HH, '2026-10'))![0]).toMatchObject({ refund_of: null, is_refund: false });
    const rec = recordFailedWrite.mock.calls[0]![0] as { entityId: string; attempted: Record<string, unknown> };
    expect(rec.entityId).toBe('r1');
    expect(rec.attempted).toEqual({ labelKey: 'refundLinked', n: 1, fields: ['refund_of', 'is_refund'] });
    expect(JSON.stringify(rec)).not.toMatch(/Shop|1000/);
  });

  it('refuses on a conflict and records it', async () => {
    const { fake, qc } = setup();
    const conflict = { entity: 'transactions', id: 'r1', updated_by: 'sam', record_name: 'Shop', builtin_key: null, reason: 'changed' };
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    const { result } = await renderHook(() => useLinkRefund(HH, USER), { wrapper: wrapper(qc) });
    result.current.link(tx('r1'), tx('p1'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect((recordFailedWrite.mock.calls[0]![0] as { kind: string }).kind).toBe('conflict');
  });
});

describe('useUnlinkRefund', () => {
  it('clears refund_of only, and the undo restores the purchase id', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk('r1', 4));
    const { result } = await renderHook(() => useUnlinkRefund(HH, USER), { wrapper: wrapper(qc) });
    expect(result.current.unlink(tx('r1', { refund_of: 'p1', is_refund: true, version: 3 }))).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_ops).toEqual([{ entity: 'transactions', id: 'r1', expectedVersion: 3, patch: { refund_of: null } }]);
    expect(args.p_undo_step.label_key).toBe('refundUnlinked');
    expect(args.p_undo_step.ops).toEqual([{ entity: 'transactions', id: 'r1', expectedVersion: 4, patch: { refund_of: 'p1' } }]);
  });
});
