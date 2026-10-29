// 05.2-73 (WR-03): an answer already live elsewhere is read as landed: no failed write, no undo step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerMutationDefaults } from '../index';
import { useAddDismissal } from '../dismissals';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

const HH = 'hh-1';
const KEY = queryKeys.recurringDismissals(HH);
const dup = { message: 'dup', code: '23505' };
const live: RecurringDismissalRow = {
  id: 'other',
  household_id: HH,
  payee_key: 'gym',
  direction: 'out',
  dismissed_at: '2026-10-01T00:00:00Z',
  created_by: 'user-2',
  deleted_at: null,
  version: 4,
};

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

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

describe('useAddDismissal live-key collision', () => {
  it('lands on the live row: no failed write, no undo step, cache holds the live row only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: dup, status: 409 });
    fake.respondWith({ data: null, error: null, status: 200 });
    fake.respondWith({ data: live, error: null, status: 200 });
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    const out = result.current.dismiss({ payeeKey: 'gym', direction: 'out', name: 'Gym' });
    await waitFor(() => expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)?.map((r) => r.id)).toEqual(['other']));
    expect(out.id).toBe('id-1');
    expect(insertUndoStep).not.toHaveBeenCalled();
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('records the undo step when the row is its own (duplicate client id)', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: dup, status: 409 });
    fake.respondWith({ data: { ...live, id: 'id-1' }, error: null, status: 200 });
    const { result } = await renderHook(() => useAddDismissal(HH, 'user-1'), { wrapper: wrapper(qc) });
    result.current.dismiss({ payeeKey: 'gym', direction: 'out', name: 'Gym', labelKey: 'payNotMine' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ labelKey: 'payNotMine' });
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});
