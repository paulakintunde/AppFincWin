// 10.1-30 (D-28): a cloned split line is inserted with its parts; an unsplit one with null.
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
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics = require('expo-haptics') as { notificationAsync: jest.Mock; impactAsync: jest.Mock };

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
  isRefund: false,
  parts: null,
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

describe('useCloneMonth category parts', () => {
  it('writes the parts of a split source and null for an unsplit one', async () => {
    mockUuid = 0;
    resetToastForTests();
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(inserted(['id-1', 'id-2'])).respondWith(ok);
    const qc = newClient();
    const { result } = await renderHook(() => useCloneMonth(), { wrapper: wrapper(qc) });
    const split: CloneCandidate = {
      ...cand(1),
      amount: -5000,
      parts: [
        { categoryId: 'cat-1', amount: -3000 },
        { categoryId: 'cat-2', amount: -2000, label: 'taxTip' },
      ],
    };
    result.current.clone({ candidates: [split, cand(2)], ...base });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    const rows = fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>[];
    expect(rows[0]!.category_parts).toEqual([
      { c: 'cat-1', a: -3000 },
      { c: 'cat-2', a: -2000, l: 'taxTip' },
    ]);
    expect(rows[1]!.category_parts).toBeNull();
  });
});
