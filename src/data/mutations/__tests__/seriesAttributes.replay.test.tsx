// 05.2-69 (WR-01): a replayed confirm rebuilds its change set from the live rows, so its Undo still removes the lines.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerMutationDefaults } from '../index';
import { useConfirmRegularCandidate } from '../seriesAttributes';
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
  name: 'Rent',
  amount: -150000,
  currency: 'GBP',
  category_id: null,
  payment_type: null,
  freq: 'monthly',
  anchor_date: '2026-10-25',
  time_zone: 'Europe/London',
  end_date: null,
  occurrence_count: null,
};

const insertOk = { data: null, error: null, status: 201 };
type Op = { entity: string; id: string; expectedVersion: number; patch: Record<string, unknown> };
const undoInserts = (fake: FakeSupabase) => fake.calls.filter((c) => c.table === 'undo_log' && c.method === 'insert');

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
});

describe('useConfirmRegularCandidate replay', () => {
  it('rebuilds the change set from the live rows so Undo removes the lines and unlinks the logged rows', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    fake.respondWith({ data: { id: 'ser-1', version: 3 }, error: null, status: 200 }); // series version read back
    fake.respondWith({
      data: [
        { id: 't1', version: 2 },
        { id: 't2', version: 2 },
        { id: 'o1', version: 1 },
      ],
      error: null,
      status: 200,
    }); // live rows of the series
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'out', linkTransactionIds: ['t1', 't2'], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    const unlink = { recurring_series_id: null, occurrence_date: null };
    const step = undoInserts(fake)[0]!.args[0] as { ops: Op[] };
    expect(step.ops).toEqual([
      { entity: 'transactions', id: 'o1', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 't1', expectedVersion: 2, patch: unlink },
      { entity: 'transactions', id: 't2', expectedVersion: 2, patch: unlink },
      { entity: 'recurring_series', id: 'ser-1', expectedVersion: 3, patch: { deleted_at: '$now' } },
    ]);
  });

  it('records the series op only when the replay finds no live rows', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    fake.respondWith({ data: { id: 'ser-1', version: 3 }, error: null, status: 200 });
    fake.respondWith({ data: [], error: null, status: 200 });
    fake.respondWith(insertOk);
    const { result } = await renderHook(() => useConfirmRegularCandidate(HH, USER), { wrapper: wrapper(qc) });
    result.current.confirm({ series: NEW_SERIES, direction: 'out', linkTransactionIds: ['t1'], attributes: {} });
    await waitFor(() => expect(undoInserts(fake)).toHaveLength(1));
    const step = undoInserts(fake)[0]!.args[0] as { ops: Op[] };
    expect(step.ops).toEqual([{ entity: 'recurring_series', id: 'ser-1', expectedVersion: 3, patch: { deleted_at: '$now' } }]);
  });
});
