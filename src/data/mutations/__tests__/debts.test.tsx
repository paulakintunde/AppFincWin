/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerDebtMutations, useSetDebtHousing } from '../debts';
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

const KEY = queryKeys.debts('hh-1');

const debt = (id: string, overrides: Partial<DebtRow> = {}): DebtRow => ({
  id,
  household_id: 'hh-1',
  account_id: null,
  check_id: null,
  series_id: null,
  name: 'Mortgage',
  kind: 'loan',
  currency: 'GBP',
  balance: 20000000,
  apr: '4.5',
  minimum_payment: 90000,
  secured: true,
  term_months: 300,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; ops: { entity: string; id: string; expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDebtMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useSetDebtHousing', () => {
  it('D-103 housing toggle is optimistic, one undo step, version-conditional', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt('d1', { version: 3 })]);
    fake.respondWith(ok([debt('d1', { is_housing: true, version: 4 })]));
    const { result } = await renderHook(() => useSetDebtHousing(), { wrapper: wrapper(qc) });

    const stepId = result.current.setHousing(debt('d1', { version: 3 }), true, 'user-1');
    expect(stepId).toBe('id-1');
    // optimistic: the cache flips before the server answers
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]?.is_housing).toBe(true));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ is_housing: true });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 3]);
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'debtHousingChanged',
      ops: [{ entity: 'debts', id: 'd1', expectedVersion: 4, patch: { is_housing: false } }],
    });
    expect(insertUndoStep).toHaveBeenCalledTimes(1);
  });

  it('D-103 a landed replay is accepted and records its one step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt('d1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(debt('d1', { is_housing: true, version: 2 })));
    const { result } = await renderHook(() => useSetDebtHousing(), { wrapper: wrapper(qc) });

    result.current.setHousing(debt('d1'), true, 'user-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ is_housing: true, version: 2 });
  });

  it('D-103 a version conflict surfaces as a parked conflict and takes the server row', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt('d1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(debt('d1', { is_housing: false, balance: 1, version: 5 })));
    const { result } = await renderHook(() => useSetDebtHousing(), { wrapper: wrapper(qc) });

    result.current.setHousing(debt('d1'), true, 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ kind: 'conflict', entity: 'debts', entityId: 'd1', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Mortgage|20000000/);
    expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ is_housing: false, version: 5 });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('D-103 a card is refused before any write', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSetDebtHousing(), { wrapper: wrapper(qc) });
    expect(() => result.current.setHousing(debt('c1', { kind: 'card' }), true, 'user-1')).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });
});
