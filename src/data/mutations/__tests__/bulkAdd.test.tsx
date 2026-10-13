// 02.3-13 (REC-30, D-14, D-15, D-28): the entry-sheet list save is one queued write and one step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import type { ListItem } from '@/engine/entryList';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { resetToastForTests } from '@/state/undoToast';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { registerBulkAddMutations, useBulkAdd, buildEntryListWrite, type BulkAddContext } from '../bulkAdd';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

const ctx: BulkAddContext = {
  householdId: 'h1',
  ownerId: 'u1',
  homeCurrency: 'GBP',
  timeZone: 'Europe/London',
  transferCategoryId: 'cat-transfer',
};

function item(over: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    type: 'out',
    amountMinor: 1250,
    currency: 'GBP',
    accountId: 'a1',
    localDate: '2026-10-09',
    name: '  Coffee ',
    categoryId: 'cat-1',
    paymentType: 'card',
    status: 'paid',
    statusTouched: false,
    note: '',
    automatic: false,
    refund: false,
    repeat: { freq: 'never' },
    toAccountId: null,
    toCurrency: null,
    amountInMinor: null,
    ...over,
  };
}

function counter(): () => string {
  let n = 0;
  return () => `m-${++n}`;
}

describe('buildEntryListWrite', () => {
  it('turns an out item into a negative row with trimmed name and null note', () => {
    const { rows, series } = buildEntryListWrite([item()], ctx, counter());
    expect(series).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      original_amount: -1250,
      status: 'paid',
      name: 'Coffee',
      category_id: 'cat-1',
      payment_type: 'card',
      note: null,
      is_refund: false,
      is_automatic: false,
    });
  });

  it('makes a refund positive and flags it; an in item is positive', () => {
    const { rows } = buildEntryListWrite(
      [item({ refund: true }), item({ type: 'in', paymentType: 'direct_deposit', note: 'pay' })],
      ctx,
      counter()
    );
    expect(rows[0]).toMatchObject({ original_amount: 1250, is_refund: true });
    expect(rows[1]).toMatchObject({ original_amount: 1250, is_refund: false, payment_type: 'direct_deposit', note: 'pay' });
  });

  it('nulls a payment type not allowed for the direction', () => {
    const { rows } = buildEntryListWrite([item({ paymentType: 'invoice' })], ctx, counter());
    expect(rows[0]!.payment_type).toBeNull();
  });

  it('builds two transfer legs sharing a transfer_id in the Transfer category', () => {
    const { rows } = buildEntryListWrite(
      [item({ type: 'transfer', name: '', amountMinor: 500, toAccountId: 'a2', toCurrency: 'GBP', categoryId: null, paymentType: null })],
      ctx,
      counter()
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ account_id: 'a1', original_amount: -500, category_id: 'cat-transfer', status: 'paid', name: null });
    expect(rows[1]).toMatchObject({ account_id: 'a2', original_amount: 500 });
    expect(rows[0]!.transfer_id).toBeTruthy();
    expect(rows[0]!.transfer_id).toBe(rows[1]!.transfer_id);
  });

  it('uses amountInMinor for the in leg of a cross-currency transfer', () => {
    const { rows } = buildEntryListWrite(
      [item({ type: 'transfer', amountMinor: 1000, toAccountId: 'a2', toCurrency: 'EUR', amountInMinor: 1150 })],
      ctx,
      counter()
    );
    expect(rows[0]).toMatchObject({ original_amount: -1000, original_currency: 'GBP' });
    expect(rows[1]).toMatchObject({ original_amount: 1150, original_currency: 'EUR' });
  });

  it('throws for a cross-currency transfer without a received amount instead of reusing the sent one', () => {
    const t = item({ type: 'transfer', amountMinor: 10000, toAccountId: 'a2', toCurrency: 'JPY', amountInMinor: null });
    expect(() => buildEntryListWrite([t], ctx, counter())).toThrow(TypeError);
    const nul = item({ type: 'transfer', toAccountId: 'a2', toCurrency: null });
    expect(() => buildEntryListWrite([nul], ctx, counter())).toThrow(TypeError);
  });

  it('throws for a transfer without a Transfer category or with the same account', () => {
    const t = item({ type: 'transfer', toAccountId: 'a2', toCurrency: 'GBP' });
    expect(() => buildEntryListWrite([t], { ...ctx, transferCategoryId: null }, counter())).toThrow(TypeError);
    expect(() => buildEntryListWrite([{ ...t, toAccountId: 'a1' }], ctx, counter())).toThrow(TypeError);
  });

  it('adds a series anchored to a repeating item row', () => {
    const { rows, series } = buildEntryListWrite(
      [item({ automatic: true, repeat: { freq: 'monthly', end: { kind: 'count', count: 6 } } })],
      ctx,
      counter()
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.anchorTransactionId).toBe(rows[0]!.id);
    expect(series[0]!.series).toMatchObject({
      name: 'Coffee',
      amount: -1250,
      freq: 'monthly',
      occurrence_count: 6,
      end_date: null,
      anchor_date: '2026-10-09',
      is_automatic: true,
    });
  });

  it('refuses more rows than one request carries', () => {
    const many = Array.from({ length: 501 }, () => item());
    expect(() => buildEntryListWrite(many, ctx, counter())).toThrow(RangeError);
  });
});

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerBulkAddMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const inserted = (count: number) => ({
  data: Array.from({ length: count }, (_, i) => ({ id: `r-${i}`, local_date: '2026-10-09', version: 1, rate_pending: false })),
  error: null,
  status: 201,
});
const applied = (id = 'x') => ({ data: { status: 'applied', undo_step_id: id, changes: [] }, error: null, status: 200 });

beforeEach(() => {
  mockUuid = 0;
  (recordFailedWrite as jest.Mock).mockClear();
  resetToastForTests();
});

describe('useBulkAdd', () => {
  it('inserts all rows once then records one addedMany step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(3)).respondWith(applied());
    const { result } = await renderHook(() => useBulkAdd(), { wrapper: wrapper(newClient()) });

    const stepId = result.current.save([item(), item({ id: 'i2' }), item({ id: 'i3', type: 'in' })], ctx);

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const upserts = fake.calls.filter((c) => c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    expect((upserts[0]!.args[0] as unknown[]).length).toBe(3);
    const rpc = fake.calls.find((c) => c.method === 'rpc')!;
    expect(rpc.args[0]).toBe('record_entry_list');
    expect(rpc.args[1]).toMatchObject({
      p_row_ids: expect.any(Array),
      p_items: [],
      p_undo_step: { id: stepId, label_key: 'addedMany', label_params: { n: 3 } },
    });
    expect((rpc.args[1] as { p_row_ids: string[] }).p_row_ids).toHaveLength(3);
  });

  it('still calls the RPC on a replay that inserts nothing new', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 201 }).respondWith({
      data: { status: 'already-applied', undo_step_id: 'x' },
      error: null,
      status: 200,
    });
    const { result } = await renderHook(() => useBulkAdd(), { wrapper: wrapper(newClient()) });
    result.current.save([item()], ctx);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('keeps transfer_id on the optimistic rows of a listed transfer', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(2)).respondWith(applied());
    const qc = newClient();
    qc.setQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-10'), []);
    const { result } = await renderHook(() => useBulkAdd(), { wrapper: wrapper(qc) });
    result.current.save([item({ type: 'transfer', toAccountId: 'a2', toCurrency: 'GBP' })], ctx);
    const cached = qc.getQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-10'))!;
    expect(cached).toHaveLength(2);
    expect(cached[0]!.transfer_id).toBeTruthy();
    expect(cached[0]!.transfer_id).toBe(cached[1]!.transfer_id);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('on a refused write removes optimistic rows and logs ids and counts only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    qc.setQueryData<WithPending<TransactionRow>[]>(queryKeys.transactionsMonth('h1', '2026-10'), []);
    const { result } = await renderHook(() => useBulkAdd(), { wrapper: wrapper(qc) });
    const stepId = result.current.save([item(), item({ id: 'i2' })], ctx);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'transactions', entityId: stepId, attempted: { count: 2 } })
    );
    expect(qc.getQueryData<unknown[]>(queryKeys.transactionsMonth('h1', '2026-10'))).toEqual([]);
  });

  it('refuses an empty list before mutate', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const { result } = await renderHook(() => useBulkAdd(), { wrapper: wrapper(newClient()) });
    expect(() => result.current.save([], ctx)).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });
});
