// 02.2-20 Task 2 (ACT-11, D-19): mark all monthly is one batch RPC and one server-recorded step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import type { SeriesOffer } from '@/engine/recurring';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerMarkMonthlyMutations, useMarkMonthly } from '../markMonthly';
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
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

const ctx = { householdId: 'h1', ownerId: 'u1', timeZone: 'Europe/London' };

function txRow(id: string, date: string, accountId = 'acc-1'): TransactionRow {
  return { id, local_date: date, category_id: 'cat-1', account_id: accountId, is_automatic: id.endsWith('b') } as unknown as TransactionRow;
}

function offer(n: number): SeriesOffer {
  return {
    key: `k${n}|GBP|-`,
    previousMonth: '2026-09',
    latestRowId: `o${n}b`,
    suggestion: {
      key: `k${n}|GBP|-`,
      name: `Sub ${n}`,
      amount: -500 * n,
      currency: 'GBP',
      freq: 'monthly',
      anchorDate: '2026-11-03',
      rowIds: [`o${n}a`, `o${n}b`],
    },
  };
}

function rowsFor(...ns: number[]): Map<string, TransactionRow> {
  const m = new Map<string, TransactionRow>();
  for (const n of ns) {
    m.set(`o${n}a`, txRow(`o${n}a`, '2026-09-03', `acc-${n}`));
    m.set(`o${n}b`, txRow(`o${n}b`, '2026-10-03', `acc-${n}`));
  }
  return m;
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMarkMonthlyMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockUuid = 0;
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useMarkMonthly', () => {
  it('sends one batch RPC with every offer anchored on its latest row and a markedMonthly step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'already-applied', undo_step_id: 'x' }, error: null, status: 200 });
    const { result } = await renderHook(() => useMarkMonthly(), { wrapper: wrapper(newClient()) });

    const stepId = result.current.markAll({ offers: [offer(1), offer(2), offer(3)], rowsById: rowsFor(1, 2, 3), ...ctx });

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const rpcs = fake.calls.filter((c) => c.method === 'rpc');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]?.args[0]).toBe('create_recurring_series_batch');
    const args = rpcs[0]?.args[1] as {
      p_items: { series: Record<string, unknown>; anchor_transaction_id: string; link_transaction_ids: string[] }[];
      p_undo_step: Record<string, unknown>;
    };
    expect(args.p_items).toHaveLength(3);
    expect(args.p_items.map((i) => i.anchor_transaction_id)).toEqual(['o1b', 'o2b', 'o3b']);
    expect(args.p_items.map((i) => i.link_transaction_ids)).toEqual([['o1a'], ['o2a'], ['o3a']]);
    expect(args.p_items.every((i) => i.series.freq === 'monthly')).toBe(true);
    expect(args.p_items[1]?.series.account_id).toBe('acc-2');
    expect(args.p_items[0]?.series.is_automatic).toBe(true);
    expect(args.p_undo_step).toEqual({ id: stepId, label_key: 'markedMonthly', label_params: { n: 3 } });
    expect(insertUndoStep).not.toHaveBeenCalled();
    expect(getToast()?.stepId).toBe(stepId);
  });

  it('markOne sends a batch of one', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'already-applied', undo_step_id: 'x' }, error: null, status: 200 });
    const { result } = await renderHook(() => useMarkMonthly(), { wrapper: wrapper(newClient()) });
    result.current.markOne({ offer: offer(1), rowsById: rowsFor(1), ...ctx });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const args = fake.calls.find((c) => c.method === 'rpc')?.args[1] as { p_items: unknown[] };
    expect(args.p_items).toHaveLength(1);
  });

  it('refuses more than 50 offers before any write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const { result } = await renderHook(() => useMarkMonthly(), { wrapper: wrapper(newClient()) });
    const many = Array.from({ length: 51 }, () => offer(1));
    expect(() => result.current.markAll({ offers: many, rowsById: rowsFor(1), ...ctx })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('records a count-only failed write and a refusal toast when the batch is rejected', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useMarkMonthly(), { wrapper: wrapper(newClient()) });
    result.current.markAll({ offers: [offer(1), offer(2)], rowsById: rowsFor(1, 2), ...ctx });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect((recordFailedWrite.mock.calls[0]?.[0] as { attempted: unknown }).attempted).toEqual({ count: 2 });
    expect(getToast()?.kind).toBe('refusal');
  });
});
