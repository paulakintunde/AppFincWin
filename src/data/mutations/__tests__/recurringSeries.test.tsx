// 02-18: recurring-series mutations (create / edit-from / end) and the two pure mapping
// helpers. The three RPCs record their own undo step server-side (D-WR-04), so these tests
// assert the step label rides on the RPC call and that insertUndoStep is never used.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, RecurringSeriesRow, TransactionRow } from '@/db/rows';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains, resolveExpectedVersion } from '@/data/sync/versionChain';
import {
  registerSeriesMutations,
  seriesInputFromRow,
  seriesPatchFromOccurrenceEdit,
  useCreateSeries,
  useEditSeriesFrom,
  useEndSeries,
} from '../recurringSeries';
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
  registerSeriesMutations(qc);
  return qc;
}

const ok = (data: unknown) => ({ data, error: null, status: 200 });

const applied = (version: number) =>
  ok({
    status: 'applied',
    series: { id: 's1', version, before: null },
    inserted: [],
    soft_deleted: [],
    linked: [],
    undo_step_id: 'step',
  });

const newSeries: NewRecurringSeries = {
  id: 's1',
  household_id: 'h1',
  account_id: 'a1',
  name: 'Rent',
  amount: -120000,
  currency: 'GBP',
  category_id: 'c1',
  payment_type: null,
  freq: 'monthly',
  anchor_date: '2026-10-03',
  time_zone: 'Europe/London',
  end_date: null,
  occurrence_count: null,
};

const seriesRow = (overrides: Partial<RecurringSeriesRow> = {}): RecurringSeriesRow => ({
  ...newSeries,
  created_by: null,
  updated_by: null,
  materialised_through: null,
  deleted_at: null,
  version: 3,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

function rpcCalls(fake: FakeSupabase): { name: string; args: Record<string, unknown> }[] {
  return fake.calls
    .filter((c) => c.method === 'rpc')
    .map((c) => ({ name: c.args[0] as string, args: c.args[1] as Record<string, unknown> }));
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('helpers', () => {
  const row = {
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -120000,
    original_currency: 'GBP',
    category_id: 'c1',
    payment_type: null,
    time_zone: 'Europe/London',
    local_date: '2026-10-03',
    name: 'Rent',
  } satisfies Pick<
    TransactionRow,
    'household_id' | 'account_id' | 'original_amount' | 'original_currency' | 'category_id' | 'payment_type' | 'time_zone' | 'local_date' | 'name'
  >;

  it('seriesInputFromRow maps the row and schedule onto a NewRecurringSeries', () => {
    expect(seriesInputFromRow(row, { freq: 'monthly', endDate: null, occurrenceCount: null }, 's1')).toEqual(newSeries);
  });

  it('seriesInputFromRow carries the schedule end date and count', () => {
    const out = seriesInputFromRow(row, { freq: 'weekly', endDate: '2027-01-01', occurrenceCount: 8 }, 's1');
    expect(out).toMatchObject({ freq: 'weekly', end_date: '2027-01-01', occurrence_count: 8 });
  });

  it('seriesInputFromRow throws a TypeError when the row has no name', () => {
    expect(() => seriesInputFromRow({ ...row, name: null }, { freq: 'monthly', endDate: null, occurrenceCount: null }, 's1')).toThrow(TypeError);
  });

  it('seriesPatchFromOccurrenceEdit maps transaction keys to series keys and drops the rest', () => {
    expect(
      seriesPatchFromOccurrenceEdit({
        original_amount: -1200,
        name: 'Rent',
        local_date: '2026-10-03',
        note: 'x',
        status: 'paid',
        deleted_at: '2026-10-01T00:00:00Z',
      })
    ).toEqual({ amount: -1200, name: 'Rent', anchor_date: '2026-10-03' });
  });

  it('seriesPatchFromOccurrenceEdit maps currency, account, category and payment type, and returns {} when nothing maps', () => {
    expect(
      seriesPatchFromOccurrenceEdit({ original_currency: 'EUR', account_id: 'a2', category_id: null, payment_type: 'card' })
    ).toEqual({ currency: 'EUR', account_id: 'a2', category_id: null, payment_type: 'card' });
    expect(seriesPatchFromOccurrenceEdit({ note: 'only a note' })).toEqual({});
  });
});

describe('useCreateSeries', () => {
  it('prepends an optimistic series and sends the undo label with the RPC, never insertUndoStep', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(1));
    const qc = newClient();
    qc.setQueryData(queryKeys.recurringSeries('h1'), [seriesRow({ id: 'other', name: 'Other' })]);
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    const stepId = result.current.create({ series: newSeries, anchorTransactionId: 't1', linkTransactionIds: ['t2'], ownerId: 'u1' });

    await waitFor(() =>
      expect(qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries('h1'))?.[0]).toMatchObject({
        id: 's1',
        version: 1,
        materialised_through: null,
        pending: true,
      })
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') }));

    const [call] = rpcCalls(fake);
    expect(call!.name).toBe('create_recurring_series');
    expect(call!.args).toMatchObject({
      p_series: newSeries,
      p_anchor_transaction_id: 't1',
      p_link_transaction_ids: ['t2'],
      p_undo_step: { id: stepId, label_key: 'seriesCreated', label_params: { name: 'Rent' } },
    });
    expect(insertUndoStep).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.recurringSeries('h1') });
  });

  it('forwards anchorIsNew as p_anchor_is_new and keeps the minted step id', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(1));
    const qc = newClient();
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });

    const stepId = result.current.create({ series: newSeries, anchorTransactionId: 't1', anchorIsNew: true, ownerId: 'u1' });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));

    expect(rpcCalls(fake)[0]!.args).toMatchObject({
      p_anchor_transaction_id: 't1',
      p_anchor_is_new: true,
      p_undo_step: { id: stepId, label_key: 'seriesCreated' },
    });
  });

  it('does not send p_anchor_is_new when anchorIsNew is not given', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(1));
    const qc = newClient();
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });

    result.current.create({ series: newSeries, anchorTransactionId: 't1', ownerId: 'u1' });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));

    expect(rpcCalls(fake)[0]!.args).not.toHaveProperty('p_anchor_is_new');
  });

  it('defaults the link arguments to null and an empty list', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(1));
    const qc = newClient();
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });

    result.current.create({ series: newSeries, ownerId: 'u1' });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));

    expect(rpcCalls(fake)[0]!.args).toMatchObject({ p_anchor_transaction_id: null, p_link_transaction_ids: [] });
  });

  it('treats already-applied as success with nothing further recorded', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(ok({ status: 'already-applied' }));
    const qc = newClient();
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    result.current.create({ series: newSeries, ownerId: 'u1' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.recurringSeries('h1') }));
    expect(insertUndoStep).not.toHaveBeenCalled();
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('removes the optimistic series and records a failed write with no amount when the server rejects', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => useCreateSeries(), { wrapper: wrapper(qc) });

    result.current.create({ series: newSeries, ownerId: 'u1' });

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<RecurringSeriesRow[]>(queryKeys.recurringSeries('h1'))).toEqual([]);
    const entry = recordFailedWrite.mock.calls[0]![0] as { entity: string; entityId: string; kind: string; attempted: Record<string, unknown> };
    expect(entry).toMatchObject({ entity: 'recurring_series', entityId: 's1', kind: 'rejected' });
    expect(entry.attempted).not.toHaveProperty('amount');
  });
});

describe('useEditSeriesFrom', () => {
  const input = {
    id: 's1',
    householdId: 'h1',
    expectedVersion: 3,
    patch: { amount: -130000 },
    effectiveFrom: '2026-11-01',
    ownerId: 'u1',
    name: 'Rent',
  };

  it('sends the whitelisted patch and the undo label, and records the new version in the chain', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(4));
    const qc = newClient();
    const { result } = await renderHook(() => useEditSeriesFrom(), { wrapper: wrapper(qc) });

    const stepId = result.current.editFrom(input);

    await waitFor(() => expect(resolveExpectedVersion('recurring_series', 's1', 3)).toBe(4));
    const [call] = rpcCalls(fake);
    expect(call!.name).toBe('edit_recurring_series_from');
    expect(call!.args).toMatchObject({
      p_series_id: 's1',
      p_expected_version: 3,
      p_patch: { amount: -130000 },
      p_effective_from: '2026-11-01',
      p_undo_step: { id: stepId, label_key: 'seriesEdited', label_params: { name: 'Rent' } },
    });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('resolves the expected version through the chain of an earlier queued edit', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(4));
    fake.respondWith(applied(5));
    const qc = newClient();
    const { result } = await renderHook(() => useEditSeriesFrom(), { wrapper: wrapper(qc) });

    result.current.editFrom(input);
    result.current.editFrom({ ...input, patch: { amount: -140000 } });

    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(2));
    expect(rpcCalls(fake)[1]!.args.p_expected_version).toBe(4);
  });

  it('invalidates and records a conflict failed write on a version conflict', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const conflict = { entity: 'recurring_series', id: 's1', updated_by: 'sam', record_name: 'Rent', builtin_key: null, reason: 'changed' };
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useEditSeriesFrom(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    result.current.editFrom(input);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'recurring_series', entityId: 's1', kind: 'conflict', code: 'version-conflict' })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.recurringSeries('h1') });
  });
});

describe('useEndSeries', () => {
  it('ends the series with its undo label and only invalidates paid history', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied(4));
    const qc = newClient();
    const { result } = await renderHook(() => useEndSeries(), { wrapper: wrapper(qc) });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    const stepId = result.current.end({ id: 's1', householdId: 'h1', expectedVersion: 3, endDate: '2026-12-31', ownerId: 'u1', name: 'Rent' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') }));
    const [call] = rpcCalls(fake);
    expect(call!.name).toBe('end_recurring_series');
    expect(call!.args).toMatchObject({
      p_series_id: 's1',
      p_expected_version: 3,
      p_end_date: '2026-12-31',
      p_undo_step: { id: stepId, label_key: 'seriesEnded', label_params: { name: 'Rent' } },
    });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});
