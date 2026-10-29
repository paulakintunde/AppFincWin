// 05.2-15: confirm a found payment as regular (series + attributes, one Undo) and patch series attributes in a batch.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, RecurringSeriesRow } from '@/db/rows';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerMutationDefaults } from '../index';
import { useConfirmRegularCandidate, usePatchSeriesAttributes } from '../seriesAttributes';
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

const NEW_SERIES: NewRecurringSeries = {
  id: 'ser-1',
  household_id: HH,
  account_id: 'acc-1',
  name: 'Salary',
  amount: 250000,
  currency: 'GBP',
  category_id: null,
  payment_type: null,
  freq: 'monthly',
  anchor_date: '2026-10-25',
  time_zone: 'Europe/London',
  end_date: null,
  occurrence_count: null,
};

const series = (id: string, overrides: Partial<RecurringSeriesRow> = {}): RecurringSeriesRow =>
  ({
    ...NEW_SERIES,
    id,
    created_by: null,
    updated_by: null,
    materialised_through: null,
    deleted_at: null,
    is_automatic: false,
    is_sample: false,
    counts_as: null,
    income_kind: null,
    saving_mode: null,
    pay_group: null,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as RecurringSeriesRow;

const dismissal = (): RecurringDismissalRow => ({
  id: 'dis-1',
  household_id: HH,
  payee_key: 'salary',
  direction: 'in',
  dismissed_at: '2026-10-01T00:00:00Z',
  created_by: USER,
  deleted_at: null,
  version: 3,
});

const createdOk = (inserted: { id: string; version: number }[] = []) => ({
  data: { status: 'applied', series: { id: 'ser-1', version: 1, before: null }, inserted, soft_deleted: [], linked: [] },
  error: null,
  status: 200,
});
const patchedOk = (...rows: [string, string, number][]) => ({
  data: { status: 'applied', rows: rows.map(([entity, id, version]) => ({ entity, id, version })) },
  error: null,
  status: 200,
});
const insertOk = { data: null, error: null, status: 201 };

type Op = { entity: string; id: string; expectedVersion: number; patch: Record<string, unknown> };
const rpcs = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');
const undoInserts = (fake: FakeSupabase) => fake.calls.filter((c) => c.table === 'undo_log' && c.method === 'insert');

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('registration', () => {
  it('registers a default mutationFn for both keys', () => {
    const { qc } = setup();
    expect(qc.getMutationDefaults(mutationKeys.confirmRegularCandidate).mutationFn).toBeDefined();
    expect(qc.getMutationDefaults(mutationKeys.patchSeriesAttributes).mutationFn).toBeDefined();
  });
});

describe('useConfirmRegularCandidate', () => {
  it('creates the series, patches its attributes, then records one undo step in that order', async () => {
    const { fake, qc } = setup();
    fake.respondWith(createdOk([{ id: 'tx-1', version: 1 }]));
    fake.respondWith(patchedOk(['recurring_series', 'ser-1', 2]));
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: { counts_as: 'available', income_kind: 'salary' } });
    expect(out).toEqual({ seriesId: 'ser-1', stepId: 'step-1' });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));

    const calls = fake.calls.filter((c) => c.method === 'rpc' || (c.table === 'undo_log' && c.method === 'insert'));
    expect(calls.map((c) => (c.method === 'rpc' ? (c.args[0] as string) : 'undo_log'))).toEqual([
      'create_recurring_series',
      'apply_patches',
      'undo_log',
    ]);
    const create = rpcs(fake)[0]!.args[1] as Record<string, unknown>;
    expect(create.p_undo_step).toBeUndefined();
    const patch = rpcs(fake)[1]!.args[1] as { p_ops: Op[]; p_undo_step: unknown };
    expect(patch.p_ops).toEqual([
      { entity: 'recurring_series', id: 'ser-1', expectedVersion: 1, patch: { counts_as: 'available', income_kind: 'salary' } },
    ]);
    expect(patch.p_undo_step).toBeNull();

    const step = undoInserts(fake)[0]!.args[0] as { id: string; label_key: string; ops: Op[] };
    expect(step.id).toBe('step-1');
    expect(step.label_key).toBe('paymentMarkedRegular');
    expect(step.ops).toEqual([
      { entity: 'transactions', id: 'tx-1', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'recurring_series', id: 'ser-1', expectedVersion: 2, patch: { deleted_at: '$now' } },
    ]);
  });

  it('clears a "not regular" answer in the same batch and inverts it in the same step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(createdOk());
    fake.respondWith(patchedOk(['recurring_series', 'ser-1', 2], ['recurring_dismissals', 'dis-1', 4]));
    fake.respondWith(insertOk);
    qc.setQueryData(queryKeys.recurringDismissals(HH), [dismissal()]);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: { counts_as: 'kept' }, dismissalToClear: dismissal() });
    await waitFor(() => expect(qc.getQueryData(queryKeys.recurringDismissals(HH))).toEqual([]));
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    const ops = (rpcs(fake)[1]!.args[1] as { p_ops: Op[] }).p_ops;
    expect(ops.map((o) => [o.entity, o.expectedVersion])).toEqual([
      ['recurring_series', 1],
      ['recurring_dismissals', 3],
    ]);
    const step = undoInserts(fake)[0]!.args[0] as { ops: Op[] };
    expect(step.ops).toContainEqual({ entity: 'recurring_dismissals', id: 'dis-1', expectedVersion: 4, patch: { deleted_at: null } });
    expect(step.ops).toContainEqual({ entity: 'recurring_series', id: 'ser-1', expectedVersion: 2, patch: { deleted_at: '$now' } });
  });

  it('skips apply_patches when there is nothing to patch', async () => {
    const { fake, qc } = setup();
    fake.respondWith(createdOk());
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    expect(rpcs(fake)).toHaveLength(1);
    const step = undoInserts(fake)[0]!.args[0] as { ops: Op[] };
    expect(step.ops).toEqual([{ entity: 'recurring_series', id: 'ser-1', expectedVersion: 1, patch: { deleted_at: '$now' } }]);
  });

  it('on a replay reads the live version back and patches at it', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    fake.respondWith({ data: { id: 'ser-1', version: 2 }, error: null, status: 200 }); // maybeSingle read back
    fake.respondWith({ data: [], error: null, status: 200 }); // live lines of the series
    fake.respondWith(patchedOk(['recurring_series', 'ser-1', 3]));
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: { pay_group: 'g1' } });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    expect((rpcs(fake)[1]!.args[1] as { p_ops: Op[] }).p_ops[0]!.expectedVersion).toBe(2);
    expect((undoInserts(fake)[0]!.args[0] as { ops: Op[] }).ops[0]).toMatchObject({ expectedVersion: 3 });
  });

  it('shows the series at once, then removes it and records ids and field names when rejected', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: { counts_as: 'available' } });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries(HH))).toEqual([]);
    const rec = recordFailedWrite.mock.calls[0]![0] as { entityId: string; attempted: Record<string, unknown> };
    expect(rec.entityId).toBe('ser-1');
    expect(rec.attempted).toEqual({ labelKey: 'paymentMarkedRegular', fields: ['counts_as'] });
    expect(JSON.stringify(rec)).not.toContain('Salary');
  });

  it('queues while offline and writes when back online', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: [], attributes: { counts_as: 'available' } });
    await waitFor(() => {
      const rows = qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries(HH));
      expect(rows).toHaveLength(1);
    });
    expect(rpcs(fake)).toHaveLength(0);
    fake.respondWith(createdOk());
    fake.respondWith(patchedOk(['recurring_series', 'ser-1', 2]));
    fake.respondWith(insertOk);
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
  });
});

describe('useConfirmRegularCandidate: sign and links (CR-01, CR-02)', () => {
  it('writes a found bill as money out and a found pay as money in', async () => {
    const { fake, qc } = setup();
    fake.respondWith(createdOk());
    fake.respondWith(insertOk);
    fake.respondWith(createdOk());
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: { ...NEW_SERIES, amount: 150000 }, direction: 'out', linkTransactionIds: [], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    result.current.confirm({ series: { ...NEW_SERIES, amount: -300000 }, direction: 'in', linkTransactionIds: [], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(2));
    const amounts = rpcs(fake).map((c) => (c.args[1] as { p_series: { amount: number } }).p_series.amount);
    expect(amounts).toEqual([-150000, 300000]);
  });

  it('rejects a series whose sign does not match its direction, with no write', async () => {
    const { fake, qc } = setup();
    const vars = {
      ownerId: USER,
      householdId: HH,
      stepId: 'step-x',
      series: { ...NEW_SERIES, amount: 150000 },
      attributes: {},
      dismissal: null,
      direction: 'out' as const,
    };
    await expect(qc.getMutationDefaults(mutationKeys.confirmRegularCandidate).mutationFn!(vars, undefined as never)).rejects.toMatchObject({ code: '23514' });
    expect(rpcs(fake)).toHaveLength(0);
  });

  it('replays older persisted variables with no direction and no link list', async () => {
    const { fake, qc } = setup();
    fake.respondWith(createdOk());
    fake.respondWith(insertOk);
    const vars = { ownerId: USER, householdId: HH, stepId: 'step-old', series: { ...NEW_SERIES, amount: 150000 }, attributes: {}, dismissal: null };
    await qc.getMutationDefaults(mutationKeys.confirmRegularCandidate).mutationFn!(vars, undefined as never);
    const args = rpcs(fake)[0]!.args[1] as { p_link_transaction_ids: string[] };
    expect(args.p_link_transaction_ids).toEqual([]);
  });

  it('links every found row, with no anchor row, and carries the linked rows into the one Undo', async () => {
    const { fake, qc } = setup();
    fake.respondWith({
      data: {
        status: 'applied',
        series: { id: 'ser-1', version: 1, before: null },
        inserted: [{ id: 'o1', version: 1 }],
        soft_deleted: [],
        linked: [
          { id: 't1', version: 2 },
          { id: 't2', version: 2 },
          { id: 't3', version: 2 },
        ],
      },
      error: null,
      status: 200,
    });
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'in', linkTransactionIds: ['t1', 't2', 't3'], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    const args = rpcs(fake)[0]!.args[1] as { p_anchor_transaction_id: string | null; p_link_transaction_ids: string[] };
    expect(args.p_anchor_transaction_id).toBeNull();
    expect(args.p_link_transaction_ids).toEqual(['t1', 't2', 't3']);
    const step = undoInserts(fake)[0]!.args[0] as { ops: Op[] };
    const unlink = { recurring_series_id: null, occurrence_date: null };
    expect(step.ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 't1', expectedVersion: 2, patch: unlink },
      { entity: 'transactions', id: 't2', expectedVersion: 2, patch: unlink },
      { entity: 'transactions', id: 't3', expectedVersion: 2, patch: unlink },
      { entity: 'recurring_series', id: 'ser-1', expectedVersion: 1, patch: { deleted_at: '$now' } },
    ]);
  });
});

describe('usePatchSeriesAttributes', () => {
  it('sends only changed keys in one batch with one undo step carrying the old values', async () => {
    const { fake, qc } = setup();
    fake.respondWith(patchedOk(['recurring_series', 'a', 2], ['recurring_series', 'b', 6]));
    const { result } = await renderHook(() => usePatchSeriesAttributes(HH, USER), { wrapper: wrapper(qc) });
    const out = result.current.patch(
      [
        { series: series('a'), attributes: { saving_mode: 'fixed', counts_as: null } },
        { series: series('b', { version: 5, saving_mode: 'fixed' }), attributes: { saving_mode: 'flexible' } },
        { series: series('c', { saving_mode: 'fixed' }), attributes: { saving_mode: 'fixed' } },
        { series: series('a'), attributes: { saving_mode: 'flexible' } },
      ],
      'setupStepSaved',
      'Saving'
    );
    expect(out).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcs(fake)).toHaveLength(1));
    const args = rpcs(fake)[0]!.args[1] as { p_ops: Op[]; p_undo_step: { label_key: string; label_params: unknown; ops: Op[] } };
    expect(args.p_ops).toEqual([
      { entity: 'recurring_series', id: 'a', expectedVersion: 1, patch: { saving_mode: 'fixed' } },
      { entity: 'recurring_series', id: 'b', expectedVersion: 5, patch: { saving_mode: 'flexible' } },
    ]);
    expect(args.p_undo_step.label_key).toBe('setupStepSaved');
    expect(args.p_undo_step.label_params).toEqual({ name: 'Saving' });
    expect(args.p_undo_step.ops).toEqual([
      { entity: 'recurring_series', id: 'a', expectedVersion: 2, patch: { saving_mode: null } },
      { entity: 'recurring_series', id: 'b', expectedVersion: 6, patch: { saving_mode: 'fixed' } },
    ]);
  });

  it('returns null and queues nothing when nothing changed', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => usePatchSeriesAttributes(HH, USER), { wrapper: wrapper(qc) });
    expect(result.current.patch([{ series: series('a', { counts_as: 'kept' }), attributes: { counts_as: 'kept' } }])).toBeNull();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(rpcs(fake)).toHaveLength(0);
  });

  it('merges the values into the cache at once and refuses the whole batch on a conflict', async () => {
    const { fake, qc } = setup();
    const conflict = { entity: 'recurring_series', id: 'b', updated_by: 'sam', record_name: 'Rent', builtin_key: null, reason: 'changed' };
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    qc.setQueryData(queryKeys.recurringSeries(HH), [series('a'), series('b')]);
    const { result } = await renderHook(() => usePatchSeriesAttributes(HH, USER), { wrapper: wrapper(qc) });
    result.current.patch([{ series: series('a'), attributes: { counts_as: 'kept' } }]);
    await waitFor(() => expect(qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries(HH))?.[0]?.counts_as).toBe('kept'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const rec = recordFailedWrite.mock.calls[0]![0] as { kind: string; attempted: Record<string, unknown> };
    expect(rec.kind).toBe('conflict');
    expect(rec.attempted).toEqual({ labelKey: 'setupStepSaved', n: 1, fields: ['counts_as'] });
  });

  it('puts the old values back when the server rejects the batch', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    qc.setQueryData(queryKeys.recurringSeries(HH), [series('a', { counts_as: 'available' })]);
    const { result } = await renderHook(() => usePatchSeriesAttributes(HH, USER), { wrapper: wrapper(qc) });
    result.current.patch([{ series: series('a', { counts_as: 'available' }), attributes: { counts_as: 'kept' } }]);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries(HH))?.[0]?.counts_as).toBe('available');
    const rec = recordFailedWrite.mock.calls[0]![0] as { entityId: string };
    expect(rec.entityId).toBe('bulk:step-1');
  });
});
