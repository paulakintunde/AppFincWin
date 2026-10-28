// 05.2-16: the tag-income batch (payer rule + every earlier untagged payment, one apply_patches, one Undo).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import type { IncomePayerPromptRow } from '@/db/incomePayerPrompts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerMutationDefaults } from '../index';
import { MAX_TAGGED_ROWS, useTagIncome } from '../incomeTags';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuid}`),
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
    name: 'Acme Ltd',
    original_amount: 250000,
    local_date: '2026-10-25',
    deleted_at: null,
    transfer_id: null,
    income_kind: null,
    counts_as: null,
    version: 1,
    ...o,
  }) as TransactionRow;

const rule = (o: Partial<IncomePayerPromptRow> = {}): IncomePayerPromptRow => ({
  id: 'rule-0',
  household_id: HH,
  payer_key: 'acme ltd',
  income_kind: 'gift',
  counts_as: 'kept',
  apply_to_future: true,
  created_by: null,
  deleted_at: null,
  version: 4,
  ...o,
});

const ruleOk = (id = 'uuid-1', version = 1) => ({
  data: { ...rule({ id, version, income_kind: 'salary', counts_as: 'available' }) },
  error: null,
  status: 201,
});
const patchedOk = (...rows: [string, string, number][]) => ({
  data: { status: 'applied', rows: rows.map(([entity, id, version]) => ({ entity, id, version })) },
  error: null,
  status: 200,
});

type Op = { entity: string; id: string; expectedVersion: number; patch: Record<string, unknown> };
type Args = { p_ops: Op[]; p_undo_step: { label_key: string; label_params: Record<string, unknown>; ops: Op[] } };
const rpcs = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');
const inserts = (fake: FakeSupabase) => fake.calls.filter((c) => c.table === 'income_payer_prompts' && c.method === 'insert');

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

it('registers a default mutationFn for tagIncome', () => {
  const { qc } = setup();
  expect(qc.getMutationDefaults(mutationKeys.tagIncome).mutationFn).toBeDefined();
});

describe('useTagIncome', () => {
  it('with Apply to future and 3 earlier rows: one rule insert, ONE apply_patches of 4 ops, one undo that restores them and removes the rule', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ruleOk());
    fake.respondWith(patchedOk(['transactions', 'a', 2], ['transactions', 'b', 6], ['transactions', 'c', 2], ['transactions', 'd', 2]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.tag({
      tx: tx('a'),
      incomeKind: 'salary',
      countsAs: 'available',
      applyToFuture: true,
      earlier: [tx('b', { version: 5, income_kind: null }), tx('c', { income_kind: null, counts_as: 'kept' }), tx('d')],
    });
    expect(out.tagged).toBe(4);
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(1);
    expect(inserts(fake)[0]!.args[0]).toMatchObject({ id: 'uuid-1', payer_key: 'acme ltd', income_kind: 'salary', counts_as: 'available' });
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_ops).toHaveLength(4);
    expect(args.p_ops.every((o) => o.entity === 'transactions')).toBe(true);
    expect(args.p_ops[0]).toEqual({ entity: 'transactions', id: 'a', expectedVersion: 1, patch: { income_kind: 'salary', counts_as: 'available' } });
    expect(args.p_undo_step.label_key).toBe('incomeTagged');
    expect(args.p_undo_step.label_params).toEqual({ n: 4, name: 'Acme Ltd' });
    expect(args.p_undo_step.ops).toContainEqual({ entity: 'transactions', id: 'a', expectedVersion: 2, patch: { income_kind: null, counts_as: null } });
    expect(args.p_undo_step.ops).toContainEqual({ entity: 'transactions', id: 'c', expectedVersion: 2, patch: { income_kind: null, counts_as: 'kept' } });
    expect(args.p_undo_step.ops).toContainEqual({ entity: 'income_payer_prompts', id: 'uuid-1', expectedVersion: 1, patch: { deleted_at: '$now' } });
    expect(args.p_undo_step.ops).toHaveLength(5);
  });

  it('skips earlier rows that already carry a tag and the row itself', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ruleOk());
    fake.respondWith(patchedOk(['transactions', 'a', 2]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.tag({
      tx: tx('a'),
      incomeKind: 'salary',
      countsAs: 'available',
      applyToFuture: true,
      earlier: [tx('a'), tx('mine', { income_kind: 'gift' })],
    });
    expect(out.tagged).toBe(1);
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect((rpcs(fake)[0]!.args[1] as Args).p_ops.map((o) => o.id)).toEqual(['a']);
  });

  it('with no earlier rows tags one payment and still creates the rule', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ruleOk());
    fake.respondWith(patchedOk(['transactions', 'a', 2]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    expect(result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [] }).tagged).toBe(1);
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(1);
  });

  it('without Apply to future writes no rule, ignores earlier rows and labels the step incomeTypeSaved', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk(['transactions', 'a', 2]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: false, earlier: [tx('b')] });
    expect(out.tagged).toBe(1);
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(0);
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_ops).toHaveLength(1);
    expect(args.p_undo_step.label_key).toBe('incomeTypeSaved');
    expect(args.p_undo_step.label_params).toEqual({ n: 1 });
  });

  it('does not insert a second rule when the payer already has a live one', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.incomePayerPrompts(HH), [rule({ income_kind: 'salary', counts_as: 'available' })]);
    fake.respondWith(patchedOk(['transactions', 'a', 2]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [] });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(0);
    expect((rpcs(fake)[0]!.args[1] as Args).p_ops.map((o) => o.entity)).toEqual(['transactions']);
  });

  it('patches the live rule inside the same batch when its kind changed, and Undo puts it back', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.incomePayerPrompts(HH), [rule()]);
    fake.respondWith(patchedOk(['transactions', 'a', 2], ['income_payer_prompts', 'rule-0', 5]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [] });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(0);
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_ops).toContainEqual({ entity: 'income_payer_prompts', id: 'rule-0', expectedVersion: 4, patch: { income_kind: 'salary', counts_as: 'available' } });
    expect(args.p_undo_step.ops).toContainEqual({ entity: 'income_payer_prompts', id: 'rule-0', expectedVersion: 5, patch: { income_kind: 'gift', counts_as: 'kept' } });
  });

  it('adopts a rule another device made first (duplicate read back) and changes it only if the answer differs', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith({ data: rule({ id: 'rule-x', income_kind: 'gift', counts_as: 'kept', version: 2 }), error: null, status: 200 });
    fake.respondWith(patchedOk(['transactions', 'a', 2], ['income_payer_prompts', 'rule-x', 3]));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [] });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    // The duplicate read-back returns the same id the client minted only when it is our own row; here it is not.
    const args = rpcs(fake)[0]!.args[1] as Args;
    expect(args.p_undo_step.ops.filter((o) => o.entity === 'income_payer_prompts')).toEqual([
      { entity: 'income_payer_prompts', id: 'rule-x', expectedVersion: 3, patch: { income_kind: 'gift', counts_as: 'kept' } },
    ]);
  });

  it('caps the rows one save tags so the undo step stays inside MAX_UNDO_OPS', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ruleOk());
    fake.respondWith(patchedOk(['transactions', 'a', 2]));
    const earlier = Array.from({ length: MAX_TAGGED_ROWS + 50 }, (_, i) => tx(`e${i}`));
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier });
    expect(out.tagged).toBe(MAX_TAGGED_ROWS);
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    expect((rpcs(fake)[0]!.args[1] as Args).p_undo_step.ops.length).toBeLessThanOrEqual(6000);
  });

  it('shows the tag at once on every cached row, then refuses the whole batch on a conflict without half-tagging', async () => {
    const { fake, qc } = setup();
    const conflict = { entity: 'transactions', id: 'b', updated_by: 'sam', record_name: 'Acme', builtin_key: null, reason: 'changed' };
    fake.respondWith(ruleOk());
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    qc.setQueryData(queryKeys.transactionsMonth(HH, '2026-10'), [tx('a'), tx('b')]);
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [tx('b')] });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(rpcs(fake)).toHaveLength(1); // one atomic call; the server tagged neither row
    const rec = recordFailedWrite.mock.calls[0]![0] as { kind: string; attempted: Record<string, unknown> };
    expect(rec.kind).toBe('conflict');
    expect(rec.attempted).toEqual({ labelKey: 'incomeTagged', n: 2, fields: ['income_kind', 'counts_as'] });
    expect(JSON.stringify(rec)).not.toContain('Acme');
  });

  it('puts the old tags back and records ids and counts only when the server rejects the batch', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ruleOk());
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    qc.setQueryData(queryKeys.transactionsMonth(HH, '2026-10'), [tx('a'), tx('b')]);
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [tx('b')] });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const rows = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth(HH, '2026-10'))!;
    expect(rows.every((r) => r.income_kind === null)).toBe(true);
    const rec = recordFailedWrite.mock.calls[0]![0] as { entityId: string; attempted: Record<string, unknown> };
    expect(rec.entityId).toBe('bulk:uuid-2');
    expect(JSON.stringify(rec)).not.toMatch(/Acme|250000/);
  });

  it('queues one item offline with every cached row tagged and pending, then writes when back online', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    qc.setQueryData(queryKeys.transactionsMonth(HH, '2026-10'), [tx('a'), tx('b'), tx('z')]);
    const { result } = await renderHook(() => useTagIncome(HH, USER), { wrapper: wrapper(qc) });
    result.current.tag({ tx: tx('a'), incomeKind: 'salary', countsAs: 'available', applyToFuture: true, earlier: [tx('b')] });
    await waitFor(() => {
      const rows = qc.getQueryData<(TransactionRow & { pending?: boolean })[]>(queryKeys.transactionsMonth(HH, '2026-10'))!;
      expect(rows.filter((r) => r.pending && r.income_kind === 'salary').map((r) => r.id)).toEqual(['a', 'b']);
      expect(rows.find((r) => r.id === 'z')!.income_kind).toBeNull();
    });
    expect(qc.getMutationCache().getAll()).toHaveLength(1);
    expect(rpcs(fake)).toHaveLength(0);
    fake.respondWith(ruleOk());
    fake.respondWith(patchedOk(['transactions', 'a', 2], ['transactions', 'b', 2]));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
  });
});
