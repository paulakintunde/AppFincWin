// 02.2-20 Task 1 (REC-19, D-13, D-14): clone month is one queued insert and one undo step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { CloneCandidate } from '@/engine/recurring';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerUndoCaptureMutations } from '../undoCapture';
import { registerCloneMonthMutations, useCloneMonth } from '../cloneMonth';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics = require('expo-haptics') as { notificationAsync: jest.Mock };

const base = { householdId: 'h1', ownerId: 'u1', homeCurrency: 'GBP', timeZone: 'Europe/London', month: '2026-10' };

const cand = (n: number): CloneCandidate => ({
  sourceId: `src-${n}`,
  localDate: '2026-10-28',
  name: `Rent ${n}`,
  amount: -1000 * n,
  currency: 'GBP',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  paymentType: 'card',
  isRefund: n === 2,
});

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerUndoCaptureMutations(qc);
  registerCloneMonthMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const inserted = (ids: string[]) => ({
  data: ids.map((id) => ({ id, local_date: '2026-10-28', version: 1, rate_pending: false })),
  error: null,
  status: 201,
});
const ok = { data: null, error: null, status: 201 };

beforeEach(() => {
  mockUuid = 0;
  resetToastForTests();
  recordFailedWrite.mockClear();
  Haptics.notificationAsync.mockClear();
});

describe('useCloneMonth', () => {
  it('inserts the candidates as pending rows and records one cloned undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(['id-1', 'id-2', 'id-3'])).respondWith(ok);
    const qc = newClient();
    const { result } = await renderHook(() => useCloneMonth(), { wrapper: wrapper(qc) });

    const stepId = result.current.clone({ candidates: [cand(1), cand(2), cand(3)], ...base });
    expect(typeof stepId).toBe('string');

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    const upsert = fake.calls.find((c) => c.method === 'upsert');
    const rows = upsert?.args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'pending' && r.local_date === '2026-10-28')).toBe(true);
    expect(rows[1]).toMatchObject({ original_amount: -2000, is_refund: true, category_id: 'cat-1', account_id: 'acc-1', payment_type: 'card' });

    const undo = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(undo).toMatchObject({ id: stepId, label_key: 'cloned', label_params: { n: 3 } });
    expect(undo.ops as unknown[]).toHaveLength(3);
    expect(getToast()?.stepId).toBe(stepId);
    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });

  it('refuses zero candidates and more than the undo cap before any write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = newClient();
    const { result } = await renderHook(() => useCloneMonth(), { wrapper: wrapper(qc) });
    expect(() => result.current.clone({ candidates: [], ...base })).toThrow(RangeError);
    const many = Array.from({ length: 6001 }, (_, i) => cand((i % 3) + 1));
    expect(() => result.current.clone({ candidates: many, ...base })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('shows the optimistic rows in a loaded month cache', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(['id-1'])).respondWith(ok);
    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-10'), []);
    const { result } = await renderHook(() => useCloneMonth(), { wrapper: wrapper(qc) });
    result.current.clone({ candidates: [cand(1)], ...base });
    await waitFor(() => {
      const rows = qc.getQueryData<{ id: string; status: string }[]>(queryKeys.transactionsMonth('h1', '2026-10'));
      expect(rows?.some((r) => r.status === 'pending')).toBe(true);
    });
  });

  it('records a failed write with counts only and a refusal toast when the insert is rejected', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    const { result } = await renderHook(() => useCloneMonth(), { wrapper: wrapper(qc) });
    result.current.clone({ candidates: [cand(1), cand(2)], ...base });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const arg = recordFailedWrite.mock.calls[0]?.[0] as { attempted: Record<string, unknown> };
    expect(arg.attempted).toEqual({ count: 2 });
    expect(getToast()?.kind).toBe('refusal');
  });
});
