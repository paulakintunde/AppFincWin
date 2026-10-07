// 02-40: transfer mutations -- one linked pair created, edited and deleted as one atomic,
// queued, conflict-aware, single-undo-step write (D-50, D-51).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { registerMutationDefaults } from '../index';
import { useAddTransfer, useDeleteTransfer, useEditTransfer, type TransferLegRow } from '../transfers';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuidCounter = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${mockUuidCounter++}`),
}));

jest.mock('@/services/locale/deviceLocale', () => ({
  getDeviceTimeZone: jest.fn(() => 'UTC'),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return qc;
}

const fullRow = (overrides: Partial<TransactionRow> = {}): TransactionRow => ({
  id: 'x',
  household_id: 'h1',
  account_id: 'a1',
  created_by: 'user-1',
  original_amount: -5000,
  original_currency: 'GBP',
  home_currency: 'GBP',
  home_amount: -5000,
  rate: '1.0000000000',
  orig_per_eur: null,
  home_per_eur: null,
  orig_custom_unit_value: null,
  orig_custom_ref_per_eur: null,
  home_custom_unit_value: null,
  home_custom_ref_per_eur: null,
  rate_date: null,
  rate_source: 'same-currency',
  rate_pending: false,
  local_date: '2026-09-24',
  time_zone: 'UTC',
  note: null,
  name: null,
  category_id: 'cat-transfer',
  payment_type: null,
  status: 'paid',
  deleted_at: null,
  import_batch_id: null,
  recurring_series_id: null,
  occurrence_date: null,
  updated_by: null,
  raw_amount: null,
  raw_balance: null,
  external_id: null,
  import_format: null,
  transfer_id: 'T1',
  version: 1,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

const outLeg = (overrides: Partial<TransferLegRow> = {}): TransferLegRow => ({
  id: 'o1',
  household_id: 'h1',
  account_id: 'a1',
  original_amount: -5000,
  original_currency: 'GBP',
  local_date: '2026-09-24',
  version: 2,
  transfer_id: 'T1',
  ...overrides,
});

const inLeg = (overrides: Partial<TransferLegRow> = {}): TransferLegRow => ({
  id: 'i1',
  household_id: 'h1',
  account_id: 'a2',
  original_amount: 5000,
  original_currency: 'GBP',
  local_date: '2026-09-24',
  version: 4,
  transfer_id: 'T1',
  ...overrides,
});

const pairState = (o: TransferLegRow, i: TransferLegRow) => ({
  out: { accountId: o.account_id, currency: o.original_currency, amount: o.original_amount, localDate: o.local_date },
  in: { accountId: i.account_id, currency: i.original_currency, amount: i.original_amount, localDate: i.local_date },
});

const addInput = {
  householdId: 'h1',
  ownerId: 'user-1',
  from: { id: 'a1', currency: 'GBP' },
  to: { id: 'a2', currency: 'GBP' },
  amountOut: 5000,
  amountIn: 5000,
  localDate: '2026-09-24',
  timeZone: 'UTC',
  transferCategoryId: 'cat-transfer',
  toName: 'Savings',
  homeCurrency: 'GBP',
} as const;

type RpcArgs = { p_ops: { id: string; expectedVersion: number; patch: Record<string, unknown> }[]; p_undo_step: { id: string; label_key: string; label_params: unknown; ops: { id: string; expectedVersion: number; patch: Record<string, unknown> }[] } | null };

function rpcArgs(fake: FakeSupabase): RpcArgs {
  const call = fake.calls.find((c) => c.method === 'rpc');
  expect(call?.args[0]).toBe('apply_patches');
  return call?.args[1] as RpcArgs;
}

const applied = (rows: { id: string; version: number }[]) => ({
  data: { status: 'applied', rows: rows.map((r) => ({ entity: 'transactions', ...r })) },
  error: null,
  status: 200,
});

beforeEach(() => {
  mockUuidCounter = 0;
  recordFailedWrite.mockClear();
  onlineManager.setOnline(true);
  clearVersionChains();
  resetResolveRateBackoffForTests();
});

describe('useAddTransfer', () => {
  it('inserts both legs in one statement sharing one transfer_id, then records one transferAdded step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: [
        { id: 'uuid-1', local_date: '2026-09-24', version: 1, rate_pending: false },
        { id: 'uuid-2', local_date: '2026-09-24', version: 1, rate_pending: false },
      ],
      error: null,
      status: 201,
    });
    fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });

    const out = result.current.add({ ...addInput, note: 'rent pot' });
    expect(out.transferId).toBe('uuid-0');

    // optimistic: both legs pending in the loaded month
    await waitFor(() => {
      const rows = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(queryKeys.transactionsMonth('h1', '2026-09'));
      expect(rows?.map((r) => r.id).sort()).toEqual(['uuid-1', 'uuid-2']);
    });

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));

    const upserts = fake.calls.filter((c) => c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    const rows = upserts[0]?.args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'uuid-1',
      account_id: 'a1',
      original_amount: -5000,
      original_currency: 'GBP',
      transfer_id: 'uuid-0',
      category_id: 'cat-transfer',
      status: 'paid',
      note: 'rent pot',
    });
    expect(rows[1]).toMatchObject({ id: 'uuid-2', account_id: 'a2', original_amount: 5000, transfer_id: 'uuid-0', category_id: 'cat-transfer', status: 'paid' });

    const step = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as {
      id: string;
      label_key: string;
      label_params: { name?: string };
      ops: { id: string; expectedVersion: number; patch: Record<string, unknown> }[];
    };
    expect(step.id).toBe(out.stepId);
    expect(step.label_key).toBe('transferAdded');
    expect(step.label_params).toEqual({ name: 'Savings' });
    expect(step.ops.map((o) => [o.id, o.expectedVersion])).toEqual([['uuid-1', 1], ['uuid-2', 1]]);
    expect(step.ops.every((o) => typeof o.patch.deleted_at === 'string')).toBe(true);
  });

  it('refuses before queueing when the legs are invalid or the Transfer category is missing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });

    expect(() => result.current.add({ ...addInput, to: { id: 'a1', currency: 'GBP' } })).toThrow(TypeError);
    expect(() => result.current.add({ ...addInput, amountOut: 0, amountIn: 0 })).toThrow(TypeError);
    expect(() => result.current.add({ ...addInput, amountIn: 4000 })).toThrow(TypeError);
    expect(() => result.current.add({ ...addInput, transferCategoryId: null })).toThrow(TypeError);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('a rejected insert removes both optimistic rows and records one failed write with ids only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'check violation', code: '23514' }, status: 400 });

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), []);
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });
    result.current.add(addInput);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'transactions',
      entityId: 'transfer:uuid-0',
      kind: 'rejected',
      code: '23514',
      attempted: { transfer_id: 'uuid-0' },
    });
    expect(qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'))).toEqual([]);
  });

  it('inserts a cross-currency pair with each leg in its own currency and the amounts as given', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: [
        { id: 'uuid-1', local_date: '2026-09-24', version: 1, rate_pending: false },
        { id: 'uuid-2', local_date: '2026-09-24', version: 1, rate_pending: false },
      ],
      error: null,
      status: 201,
    });
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });
    result.current.add({ ...addInput, to: { id: 'a2', currency: 'EUR' }, amountIn: 5800 });

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    const rows = fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ original_currency: 'GBP', original_amount: -5000 });
    expect(rows[1]).toMatchObject({ original_currency: 'EUR', original_amount: 5800 });
  });

  it('WR-01: a replayed insert that returns no rows re-reads both legs and records the step the lost first attempt never wrote', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 201 }); // ignoreDuplicates: both rows already exist
    fake.respondWith({
      data: [
        { id: 'uuid-1', local_date: '2026-09-24', version: 1, rate_pending: false, deleted_at: null },
        { id: 'uuid-2', local_date: '2026-09-24', version: 1, rate_pending: false, deleted_at: null },
      ],
      error: null,
      status: 200,
    });
    fake.respondWith({ data: null, error: null, status: 201 }); // undo_log insert

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });
    const out = result.current.add(addInput);

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    const reread = fake.calls.filter((c) => c.table === 'transactions' && c.method === 'in');
    expect(reread.at(-1)?.args).toEqual(['id', ['uuid-1', 'uuid-2']]);
    const step = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as {
      id: string;
      label_key: string;
      ops: { id: string; expectedVersion: number }[];
    };
    expect(step.id).toBe(out.stepId);
    expect(step.label_key).toBe('transferAdded');
    expect(step.ops.map((o) => [o.id, o.expectedVersion])).toEqual([['uuid-1', 1], ['uuid-2', 1]]);
  });

  it('WR-01: records no step on a replay when either leg has changed since (no honest inverse)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 201 });
    fake.respondWith({
      data: [
        { id: 'uuid-1', local_date: '2026-09-24', version: 2, rate_pending: false, deleted_at: null },
        { id: 'uuid-2', local_date: '2026-09-24', version: 1, rate_pending: false, deleted_at: null },
      ],
      error: null,
      status: 200,
    });

    const qc = newClient();
    const { result } = await renderHook(() => useAddTransfer(), { wrapper: wrapper(qc) });
    result.current.add(addInput);

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    expect(fake.calls.some((c) => c.table === 'undo_log')).toBe(false);
  });
});

describe('useEditTransfer', () => {
  it('sends one apply_patches with only the changed keys per leg, the undo step, and expected versions', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied([{ id: 'o1', version: 3 }, { id: 'i1', version: 5 }]));

    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();
    const after = pairState(o, i);
    after.out.localDate = '2026-09-25';
    after.in.localDate = '2026-09-25';

    const stepId = result.current.edit({ out: o, in: i }, after, { ownerId: 'user-1', labelName: 'Savings' });
    expect(stepId).not.toBeNull();

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 2, patch: { local_date: '2026-09-25' } },
      { entity: 'transactions', id: 'i1', expectedVersion: 4, patch: { local_date: '2026-09-25' } },
    ]);
    expect(args.p_undo_step?.id).toBe(stepId);
    expect(args.p_undo_step?.label_key).toBe('transferEdited');
    expect(args.p_undo_step?.ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 3, patch: { local_date: '2026-09-24' } },
      { entity: 'transactions', id: 'i1', expectedVersion: 5, patch: { local_date: '2026-09-24' } },
    ]);
  });

  it('a same-currency amount edit patches -m and +m; an account change patches the in-leg only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied([{ id: 'o1', version: 3 }, { id: 'i1', version: 5 }]));

    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();
    const after = pairState(o, i);
    after.out.amount = -7000;
    after.in.amount = 7000;
    after.in.accountId = 'a3';
    after.in.currency = 'GBP';

    result.current.edit({ out: o, in: i }, after, { ownerId: 'user-1', labelName: 'Pot' });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = rpcArgs(fake);
    expect(args.p_ops[0]?.patch).toEqual({ original_amount: -7000 });
    expect(args.p_ops[1]?.patch).toEqual({ account_id: 'a3', original_currency: 'GBP', original_amount: 7000 });
    expect(args.p_undo_step?.ops[1]?.patch).toEqual({ account_id: 'a2', original_currency: 'GBP', original_amount: 5000 });
  });

  it('returns null and sends nothing when nothing changed', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();

    expect(result.current.edit({ out: o, in: i }, pairState(o, i), { ownerId: 'user-1', labelName: 'x' })).toBeNull();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses an edited pair that breaks a pair rule (date mismatch) before queueing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();
    const after = pairState(o, i);
    after.out.localDate = '2026-09-26';

    expect(() => result.current.edit({ out: o, in: i }, after, { ownerId: 'user-1', labelName: 'x' })).toThrow(TypeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses legs that are not one linked pair (null or different transfer_id)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const ctx = { ownerId: 'user-1', labelName: 'x' };
    const o = outLeg();
    const i = inLeg({ transfer_id: 'T2' });
    const after = pairState(o, i);
    after.out.localDate = '2026-09-25';
    after.in.localDate = '2026-09-25';
    expect(() => result.current.edit({ out: o, in: i }, after, ctx)).toThrow(TypeError);

    const loose = outLeg({ transfer_id: null as unknown as string });
    expect(() => result.current.edit({ out: loose, in: inLeg() }, after, ctx)).toThrow(TypeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a version conflict on either leg changes neither, records a conflict failed write with ids only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 'i1', updated_by: 'u2', record_name: null, builtin_key: null, reason: 'changed' },
      },
      error: null,
      status: 200,
    });

    const qc = newClient();
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();
    const after = pairState(o, i);
    after.out.localDate = '2026-09-25';
    after.in.localDate = '2026-09-25';
    result.current.edit({ out: o, in: i }, after, { ownerId: 'user-1', labelName: 'x' });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'transactions',
      entityId: 'transfer:T1',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { transfer_id: 'T1', action: 'edit' },
    });
  });

  it('optimistically moves both legs in loaded months', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied([{ id: 'o1', version: 3 }, { id: 'i1', version: 5 }]));

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [
      fullRow({ id: 'o1', version: 2 }),
      fullRow({ id: 'i1', account_id: 'a2', original_amount: 5000, home_amount: 5000, version: 4 }),
    ]);
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-10'), []);
    const { result } = await renderHook(() => useEditTransfer(), { wrapper: wrapper(qc) });
    const o = outLeg();
    const i = inLeg();
    const after = pairState(o, i);
    after.out.localDate = '2026-10-02';
    after.in.localDate = '2026-10-02';
    result.current.edit({ out: o, in: i }, after, { ownerId: 'user-1', labelName: 'x' });

    await waitFor(() => {
      const oct = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-10'));
      expect(oct?.map((r) => r.id).sort()).toEqual(['i1', 'o1']);
    });
    expect(qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'))).toEqual([]);
  });
});

describe('useDeleteTransfer', () => {
  it('fetches the pair at flush, then soft-deletes both in one apply_patches with a transferDeleted step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [fullRow({ id: 'o1', version: 2 }), fullRow({ id: 'i1', account_id: 'a2', original_amount: 5000, version: 4 })], error: null, status: 200 });
    fake.respondWith(applied([{ id: 'o1', version: 3 }, { id: 'i1', version: 5 }]));

    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [
      fullRow({ id: 'o1', version: 2 }),
      fullRow({ id: 'i1', account_id: 'a2', original_amount: 5000, version: 4 }),
    ]);
    const { result } = await renderHook(() => useDeleteTransfer(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(outLeg(), { ownerId: 'user-1', labelName: 'Savings' });

    // optimistic removal takes BOTH legs out even though only one was in hand
    await waitFor(() => expect(qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'))).toEqual([]));

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(fake.calls.find((c) => c.method === 'in')?.args).toEqual(['transfer_id', ['T1']]);
    const args = rpcArgs(fake);
    expect(args.p_ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 2, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'i1', expectedVersion: 4, patch: { deleted_at: '$now' } },
    ]);
    expect(args.p_undo_step?.id).toBe(stepId);
    expect(args.p_undo_step?.label_key).toBe('transferDeleted');
    expect(args.p_undo_step?.ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 3, patch: { deleted_at: null } },
      { entity: 'transactions', id: 'i1', expectedVersion: 5, patch: { deleted_at: null } },
    ]);
  });

  it('refuses the delete (conflict, nothing sent) when the fetched rows are not exactly one linked pair', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [fullRow({ id: 'o1', version: 2 })], error: null, status: 200 });
    fake.respondWith({ data: null, error: null, status: 200 }); // WR-02: this delete's step was never recorded

    const qc = newClient();
    const { result } = await renderHook(() => useDeleteTransfer(), { wrapper: wrapper(qc) });
    result.current.remove(outLeg(), { ownerId: 'user-1', labelName: 'x' });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'transfer:T1', kind: 'conflict', attempted: { transfer_id: 'T1', action: 'delete' } })
    );
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
  });

  it('WR-02: a replay whose first attempt landed (no live legs, step recorded) succeeds without a false conflict', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 200 }); // both legs already soft-deleted
    fake.respondWith({ data: { id: 'uuid-0' }, error: null, status: 200 }); // the step exists

    const qc = newClient();
    const { result } = await renderHook(() => useDeleteTransfer(), { wrapper: wrapper(qc) });
    const stepId = result.current.remove(outLeg(), { ownerId: 'user-1', labelName: 'x' });

    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('success'));
    const lookup = fake.calls.filter((c) => c.table === 'undo_log');
    expect(lookup.find((c) => c.method === 'eq')?.args).toEqual(['id', stepId]);
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('IN-03: when the caller has both legs, the partner is checked at the version the user saw', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    // The partner was edited elsewhere (now version 6) after the user looked at it (version 4).
    fake.respondWith({ data: [fullRow({ id: 'o1', version: 2 }), fullRow({ id: 'i1', account_id: 'a2', original_amount: 5000, version: 6 })], error: null, status: 200 });
    fake.respondWith(applied([{ id: 'o1', version: 3 }, { id: 'i1', version: 7 }]));

    const qc = newClient();
    const { result } = await renderHook(() => useDeleteTransfer(), { wrapper: wrapper(qc) });
    result.current.remove(outLeg(), { ownerId: 'user-1', labelName: 'x' }, inLeg());

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcArgs(fake).p_ops.map((o) => [o.id, o.expectedVersion])).toEqual([
      ['o1', 2],
      ['i1', 4],
    ]);
  });

  it('a version conflict from apply_patches records one conflict failed write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [fullRow({ id: 'o1', version: 2 }), fullRow({ id: 'i1', account_id: 'a2', original_amount: 5000, version: 4 })], error: null, status: 200 });
    fake.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 'o1', updated_by: 'u2', record_name: null, builtin_key: null, reason: 'changed' },
      },
      error: null,
      status: 200,
    });

    const qc = newClient();
    const { result } = await renderHook(() => useDeleteTransfer(), { wrapper: wrapper(qc) });
    result.current.remove(outLeg(), { ownerId: 'user-1', labelName: 'x' });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'transfer:T1', kind: 'conflict', code: 'version-conflict' })
    );
  });
});
