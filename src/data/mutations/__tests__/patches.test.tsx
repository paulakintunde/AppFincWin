// 02-16 Task 1: bulk delete / mark paid / mark unpaid -- one atomic apply_patches call that
// also carries its own undo step (ACT-05, D-06, D-24, D-50).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { clearVersionChains, resolveExpectedVersion } from '@/data/sync/versionChain';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerPatchMutations, useBulkDelete, useBulkMarkPaid, useBulkMarkUnpaid } from '../patches';
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

const ctx = { householdId: 'h1', ownerId: 'user-1' };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerPatchMutations(qc);
  return qc;
}

type Row = Pick<TransactionRow, 'id' | 'version' | 'local_date' | 'status' | 'household_id' | 'transfer_id'>;
const row = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  version: 1,
  local_date: '2026-09-10',
  status: 'paid',
  household_id: 'h1',
  transfer_id: null,
  ...overrides,
});

function fullRow(r: Row): WithPending<TransactionRow> {
  return { ...(r as unknown as TransactionRow), name: r.id, original_amount: -100, deleted_at: null };
}

const applied = (...ids: [string, number][]) => ({
  data: { status: 'applied', rows: ids.map(([id, version]) => ({ entity: 'transactions', id, version })) },
  error: null,
  status: 200,
});

function rpcArgs(fake: FakeSupabase): { p_ops: { id: string; expectedVersion: number; patch: Record<string, unknown> }[]; p_undo_step: Record<string, unknown> } {
  const call = fake.calls.find((c) => c.method === 'rpc');
  return (call?.args[1] as never) ?? ({} as never);
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('useBulkDelete', () => {
  it('sends one apply_patches call with soft-delete ops and a labelled undo step, returning the step id', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2], ['b', 4]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove([row('a'), row('b', { version: 3 })], ctx);
    expect(stepId).toBe('step-1');

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(fake.calls.filter((c) => c.method === 'rpc')[0]?.args[0]).toBe('apply_patches');
    expect(args.p_ops).toEqual([
      { entity: 'transactions', id: 'a', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'b', expectedVersion: 3, patch: { deleted_at: '$now' } },
    ]);
    expect(args.p_undo_step).toMatchObject({ id: 'step-1', label_key: 'deletedMany', label_params: { n: 2 } });
    expect((args.p_undo_step.ops as { expectedVersion: number; patch: unknown }[]).map((o) => [o.expectedVersion, o.patch])).toEqual([
      [2, { deleted_at: null }],
      [4, { deleted_at: null }],
    ]);
  });

  it('removes deleted rows from loaded month caches immediately and refetches on success', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2]));
    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [fullRow(row('a')), fullRow(row('keep'))]);
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    result.current.remove([row('a')], ctx);

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRowLike[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.map((r) => r.id)).toEqual(['keep']);
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('user-1') });
  });

  it('records each returned version in the chain so a later queued write chains onto it', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    result.current.remove([row('a')], ctx);
    await waitFor(() => expect(resolveExpectedVersion('transactions', 'a', 1)).toBe(2));
  });

  it('refuses whole on a conflict: refetch, one failed write, a refusal toast carrying who and what', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const conflict = { entity: 'transactions', id: 'b', updated_by: 'sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' };
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    result.current.remove([row('a'), row('b')], ctx);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'transactions',
      entityId: 'b',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'deletedMany', n: 2 },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
    expect(getToast()).toMatchObject({
      kind: 'refusal',
      refusal: { entity: 'transactions', id: 'b', updatedBy: 'sam', recordName: 'Groceries', reason: 'changed' },
    });
  });

  it('throws RangeError before mutating for an empty selection or more than 6000 rows', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    expect(() => result.current.remove([], ctx)).toThrow(RangeError);
    const many = Array.from({ length: 6001 }, (_, i) => row(`r${i}`));
    expect(() => result.current.remove(many, ctx)).toThrow(RangeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });

  it('WR-04: counts unpaired transfer legs (partners fetched at flush) toward the 6000 limit up front', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    const plain = Array.from({ length: 5999 }, (_, i) => row(`r${i}`));
    const legs = [row('leg-1', { transfer_id: 'T1' }), row('leg-2', { transfer_id: 'T2' })];
    // 6000 selected + 2 partners pulled in at flush = 6002 ops: refused before anything is queued.
    expect(() => result.current.remove([...plain.slice(1), ...legs], ctx)).toThrow(RangeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });

  it('WR-04: a batch that crosses 6000 ops after partner expansion fails with a bulk-too-large code, sending nothing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [fullRow(row('leg-a', { transfer_id: 'T1' })), fullRow(row('leg-b', { version: 3, transfer_id: 'T1' }))], error: null, status: 200 });
    const qc = newClient();
    // A batch persisted before the up-front check existed: 6000 rows, one with an unselected partner.
    const items = Array.from({ length: 5999 }, (_, i) => ({
      entity: 'transactions' as const,
      id: `r${i}`,
      expectedVersion: 1,
      before: { deleted_at: null },
      patch: { deleted_at: '$now' },
    }));
    items.push({ entity: 'transactions', id: 'leg-a', expectedVersion: 1, before: { deleted_at: null }, patch: { deleted_at: '$now' } });
    const mutation = qc.getMutationCache().build(qc, { mutationKey: mutationKeys.bulkPatch });
    await mutation
      .execute({
        ...ctx,
        items,
        months: ['2026-09'],
        expandTransferIds: ['T1'],
        undo: { stepId: 'step-x', labelKey: 'deletedMany', labelParams: { n: 6000 } },
      })
      .catch(() => undefined);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rejected', code: 'bulk-too-large' }));
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
  });

  it('deduplicates repeated rows so planBulkPatch never sees a duplicate', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    result.current.remove([row('a'), row('a')], ctx);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops).toHaveLength(1);
    expect(args.p_undo_step.label_params).toEqual({ n: 1 });
  });

  it('D-50: a selected transfer leg whose partner is not selected pulls the partner in at flush', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const partner = { ...fullRow(row('leg-b', { version: 5, transfer_id: 'T1' })) };
    fake.respondWith({ data: [fullRow(row('leg-a', { transfer_id: 'T1' })), partner], error: null, status: 200 }); // fetchTransferLegs
    fake.respondWith(applied(['leg-a', 2], ['leg-b', 6]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });

    result.current.remove([row('leg-a', { transfer_id: 'T1' })], ctx);

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops.map((o) => [o.id, o.expectedVersion])).toEqual([
      ['leg-a', 1],
      ['leg-b', 5],
    ]);
    expect(args.p_undo_step).toMatchObject({ label_params: { n: 2 } });
    expect((args.p_undo_step.ops as { id: string; expectedVersion: number; patch: unknown }[]).map((o) => [o.id, o.expectedVersion, o.patch])).toEqual([
      ['leg-a', 2, { deleted_at: null }],
      ['leg-b', 6, { deleted_at: null }],
    ]);
  });

  it('D-50: both legs selected makes no fetch; an already-deleted partner adds nothing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2], ['b', 2]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkDelete(), { wrapper: wrapper(qc) });
    result.current.remove([row('a', { transfer_id: 'T1' }), row('b', { transfer_id: 'T1' })], ctx);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(fake.calls.some((c) => c.method === 'select')).toBe(false);

    const fake2 = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake2;
    fake2.respondWith({ data: [fullRow(row('solo', { transfer_id: 'T2' }))], error: null, status: 200 }); // only itself comes back
    fake2.respondWith(applied(['solo', 2]));
    result.current.remove([row('solo', { transfer_id: 'T2' })], ctx);
    await waitFor(() => expect(fake2.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcArgs(fake2).p_ops).toHaveLength(1);
  });
});

type TransactionRowLike = { id: string; status?: string; local_date?: string; pending?: boolean };

describe('useBulkMarkPaid / useBulkMarkUnpaid', () => {
  it('mark paid patches only pending non-transfer rows with the paid date, and merges in place as pending', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['p1', 2]));
    const qc = newClient();
    const pending = row('p1', { status: 'pending', local_date: '2026-09-02' });
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [fullRow(pending), fullRow(row('paid1'))]);
    const { result } = await renderHook(() => useBulkMarkPaid(), { wrapper: wrapper(qc) });

    result.current.markPaid([pending, row('paid1'), row('leg', { status: 'pending', transfer_id: 'T' })], ctx, '2026-09-20');

    await waitFor(() => {
      const rows = qc.getQueryData<TransactionRowLike[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.find((r) => r.id === 'p1')).toMatchObject({ status: 'paid', pending: true });
    });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops).toHaveLength(1);
    expect(args.p_ops[0]).toMatchObject({ id: 'p1', patch: { status: 'paid' } });
    expect(args.p_undo_step).toMatchObject({ label_key: 'markedPaidMany', label_params: { n: 1 } });
    expect((args.p_undo_step.ops as { patch: Record<string, unknown> }[])[0]?.patch).toMatchObject({ status: 'pending', local_date: '2026-09-02' });
  });

  it('mark unpaid patches only paid non-transfer rows', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(['a', 2]));
    const qc = newClient();
    const { result } = await renderHook(() => useBulkMarkUnpaid(), { wrapper: wrapper(qc) });

    result.current.markUnpaid([row('a'), row('b', { status: 'pending' }), row('c', { transfer_id: 'T' })], ctx);

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops.map((o) => [o.id, o.patch])).toEqual([['a', { status: 'pending' }]]);
    expect(args.p_undo_step).toMatchObject({ label_key: 'markedUnpaidMany' });
  });

  it('throws RangeError("nothing to mark") when only transfer legs (or no eligible rows) are selected', async () => {
    const qc = newClient();
    const paid = await renderHook(() => useBulkMarkPaid(), { wrapper: wrapper(qc) });
    const unpaid = await renderHook(() => useBulkMarkUnpaid(), { wrapper: wrapper(qc) });

    expect(() => paid.result.current.markPaid([row('x', { status: 'pending', transfer_id: 'T' })], ctx, '2026-09-20')).toThrow(
      new RangeError('nothing to mark')
    );
    expect(() => unpaid.result.current.markUnpaid([row('x', { transfer_id: 'T' })], ctx)).toThrow(RangeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});
