// 05.2-15 (DSU-06): how a card is paid each month saves as an undoable, version-conditional queued write.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerDebtMutations, useSetDebtPaysInFull } from '../debts';
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

const card = (overrides: Partial<DebtRow> = {}): DebtRow => ({
  id: 'd1',
  household_id: 'hh-1',
  account_id: 'acc-1',
  check_id: null,
  series_id: null,
  name: 'Visa',
  kind: 'card',
  currency: 'GBP',
  balance: 120000,
  apr: '21.9',
  minimum_payment: 2500,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
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

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDebtMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useSetDebtPaysInFull', () => {
  it('registers a default mutationFn', () => {
    const { qc } = setup();
    expect(qc.getMutationDefaults(mutationKeys.setDebtPaysInFull).mutationFn).toBeDefined();
  });

  it('saves the value, version-conditional, with one undo step carrying the old value', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [card({ version: 3, pays_in_full: 'no' })]);
    fake.respondWith(ok([card({ pays_in_full: 'sometimes', version: 4 })]));
    const { result } = await renderHook(() => useSetDebtPaysInFull(), { wrapper: wrapper(qc) });

    const stepId = result.current.setPaysInFull(card({ version: 3, pays_in_full: 'no' }), 'sometimes', 'user-1', 'card payment');
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]?.pays_in_full).toBe('sometimes'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ pays_in_full: 'sometimes' });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 3]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: stepId,
      labelKey: 'setupStepSaved',
      labelParams: { name: 'card payment' },
      ops: [{ entity: 'debts', id: 'd1', expectedVersion: 4, patch: { pays_in_full: 'no' } }],
    });
  });

  it('an unset value is restored as null by Undo', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([card({ pays_in_full: 'yes', version: 2 })]));
    const { result } = await renderHook(() => useSetDebtPaysInFull(), { wrapper: wrapper(qc) });
    result.current.setPaysInFull(card(), 'yes', 'user-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    const step = insertUndoStep.mock.calls[0]![1] as { labelParams: unknown; ops: { patch: unknown }[] };
    expect(step.ops[0]!.patch).toEqual({ pays_in_full: null });
    expect(step.labelParams).toEqual({});
  });

  it('queues while offline and writes on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    qc.setQueryData(KEY, [card()]);
    const { result } = await renderHook(() => useSetDebtPaysInFull(), { wrapper: wrapper(qc) });
    result.current.setPaysInFull(card(), 'yes', 'user-1');
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]?.pays_in_full).toBe('yes'));
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(0);
    fake.respondWith(ok([card({ pays_in_full: 'yes', version: 2 })]));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
  });

  it('parks a version conflict as a failed write with ids only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [card()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(card({ pays_in_full: 'no', version: 5 })));
    const { result } = await renderHook(() => useSetDebtPaysInFull(), { wrapper: wrapper(qc) });
    result.current.setPaysInFull(card(), 'yes', 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'debts',
      entityId: 'd1',
      kind: 'conflict',
      attempted: { labelKey: 'setupStepSaved', fields: 1 },
    });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});
