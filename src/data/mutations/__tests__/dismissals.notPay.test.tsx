// 05.2-66 (F-02): "Not my pay" answers reuse the dismissal writes with their own undo labels.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerMutationDefaults } from '../index';
import { notPayKey } from '@/features/income/notPay';
import { useAddDismissal, useRemoveDismissal } from '../dismissals';
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

const HH = 'hh-1';
const KEY = queryKeys.recurringDismissals(HH);

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const row = (overrides: Partial<RecurringDismissalRow> = {}): RecurringDismissalRow => ({
  id: 'dis-1',
  household_id: HH,
  payee_key: 'gym',
  direction: 'out',
  dismissed_at: '2026-10-01T00:00:00Z',
  created_by: 'user-1',
  deleted_at: null,
  version: 1,
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

const NP_KEY = notPayKey('refund - online store|GBP|1');

describe('Not my pay writes', () => {
  it('inserts the not-pay row, shows it at once, records payNotMine whose inverse soft deletes it', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ id: 'id-2', payee_key: NP_KEY, direction: 'in' })));
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: NP_KEY, direction: 'in', name: 'Refund - Online Store', labelKey: 'payNotMine' });
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)?.[0]?.payee_key).toBe(NP_KEY));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ id: 'id-1', household_id: HH, payee_key: NP_KEY, direction: 'in' });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'payNotMine',
      labelParams: { name: 'Refund - Online Store' },
      ops: [{ entity: 'recurring_dismissals', id: 'id-2', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
  });

  it('records the not-pay label on a rejected insert', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: NP_KEY, direction: 'in', labelKey: 'payNotMine' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ attempted: { labelKey: 'payNotMine' } });
  });

  it('reads back a duplicate client id as landed', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(row({ id: 'id-1', payee_key: NP_KEY, direction: 'in' })));
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: NP_KEY, direction: 'in', labelKey: 'payNotMine' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('clearing soft deletes the row and records payNotMineCleared whose inverse puts it back', async () => {
    const { fake, qc } = setup();
    const r = row({ payee_key: NP_KEY, direction: 'in', version: 2 });
    qc.setQueryData(KEY, [r]);
    fake.respondWith(ok([row({ ...r, version: 3, deleted_at: '2026-10-28T00:00:00Z' })]));
    const { result } = await renderHook(() => useRemoveDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.restore(r, 'Refund - Online Store', 'payNotMineCleared');
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)).toEqual([]));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'payNotMineCleared',
      labelParams: { name: 'Refund - Online Store' },
      ops: [{ entity: 'recurring_dismissals', id: 'dis-1', expectedVersion: 3, patch: { deleted_at: null } }],
    });
  });

  it('records the cleared label on a parked conflict', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [row()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(row({ version: 9 })));
    const { result } = await renderHook(() => useRemoveDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.restore(row(), null, 'payNotMineCleared');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ attempted: { labelKey: 'payNotMineCleared' } });
  });

  it('keeps the 05.2-65 default labels when no labelKey is given', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ id: 'id-2' })));
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: 'gym', direction: 'out' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ labelKey: 'paymentDismissed' });
  });
});
