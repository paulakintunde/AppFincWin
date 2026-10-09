// 02.2-20 Task 1 (REC-21, D-20, D-21): paste lines is one queued insert and one undo step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { ParsedLine } from '@/engine/paste/parseLines';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerUndoCaptureMutations } from '../undoCapture';
import { registerPasteLinesMutations, usePasteLines } from '../pasteLines';
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

const base = {
  householdId: 'h1',
  ownerId: 'u1',
  accountId: 'acc-1',
  currency: 'GBP',
  homeCurrency: 'GBP',
  timeZone: 'Europe/London',
  month: '2026-10',
};

const line = (n: number, amount: number, categoryId: string | null = null): ParsedLine & { categoryId: string | null } => ({
  lineNo: n,
  name: `Line ${n}`,
  amount,
  localDate: '2026-10-09',
  direction: amount < 0 ? 'out' : 'in',
  categoryId,
});

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerUndoCaptureMutations(qc);
  registerPasteLinesMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const inserted = (from: number, count: number) => ({
  data: Array.from({ length: count }, (_, i) => ({ id: `r-${from + i}`, local_date: '2026-10-09', version: 1, rate_pending: false })),
  error: null,
  status: 201,
});
const ok = { data: null, error: null, status: 201 };

beforeEach(() => {
  mockUuid = 0;
  resetToastForTests();
});

describe('usePasteLines', () => {
  it('inserts signed pending lines with optional categories and one pasted undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(1, 2)).respondWith(ok);
    const { result } = await renderHook(() => usePasteLines(), { wrapper: wrapper(newClient()) });

    const stepId = result.current.add({ lines: [line(1, -450, 'cat-9'), line(2, 1200)], ...base });

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    const rows = fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ original_amount: -450, status: 'pending', category_id: 'cat-9', account_id: 'acc-1' });
    expect(rows[1]).toMatchObject({ original_amount: 1200, status: 'pending', category_id: null });
    const undo = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(undo).toMatchObject({ id: stepId, label_key: 'pasted', label_params: { n: 2 } });
    expect(getToast()?.stepId).toBe(stepId);
  });

  it('inserts 1200 lines in 500/500/200 chunks and records one step of 1200 ops', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(1, 500)).respondWith(inserted(501, 500)).respondWith(inserted(1001, 200)).respondWith(ok);
    const { result } = await renderHook(() => usePasteLines(), { wrapper: wrapper(newClient()) });

    result.current.add({ lines: Array.from({ length: 1200 }, (_, i) => line(i + 1, -100)), ...base });

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    const upserts = fake.calls.filter((c) => c.method === 'upsert').map((c) => (c.args[0] as unknown[]).length);
    expect(upserts).toEqual([500, 500, 200]);
    const undo = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as { ops: unknown[] };
    expect(undo.ops).toHaveLength(1200);
  });

  it('refuses an empty or oversized paste before any write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const { result } = await renderHook(() => usePasteLines(), { wrapper: wrapper(newClient()) });
    expect(() => result.current.add({ lines: [], ...base })).toThrow(RangeError);
    const many = Array.from({ length: 6001 }, (_, i) => line(i + 1, -1));
    expect(() => result.current.add({ lines: many, ...base })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('treats a replay that inserts nothing new as success without a second undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: [], error: null, status: 201 });
    const { result } = await renderHook(() => usePasteLines(), { wrapper: wrapper(newClient()) });
    result.current.add({ lines: [line(1, -100)], ...base });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.calls.some((c) => c.table === 'undo_log')).toBe(false);
  });
});
