// 02.2-23 Task 1 (ACT-16, D-24): delete an empty account as one undoable soft delete.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerAccountDeleteMutations, useDeleteAccount } from '../accountDelete';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const account = { id: 'a1', name: 'Wallet', version: 3 } as AccountRow;
const ctx = { householdId: 'h1', ownerId: 'u1' };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerAccountDeleteMutations(qc);
  qc.setQueryData(queryKeys.accounts('h1'), [account, { id: 'a2', name: 'Bank', version: 1 }]);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('useDeleteAccount', () => {
  it('sends one apply_patches soft delete with an accountDeleted inverse step and removes the account at once', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'applied', rows: [{ entity: 'accounts', id: 'a1', version: 4 }] }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(account, ctx);

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const rpc = fake.calls.find((c) => c.method === 'rpc');
    expect(rpc?.args[0]).toBe('apply_patches');
    const args = rpc?.args[1] as {
      p_ops: { entity: string; id: string; patch: Record<string, unknown> }[];
      p_undo_step: { id: string; label_key: string; label_params: unknown; ops: { patch: Record<string, unknown> }[] };
    };
    expect(args.p_ops).toHaveLength(1);
    expect(args.p_ops[0]).toMatchObject({ entity: 'accounts', id: 'a1', patch: { deleted_at: '$now' } });
    expect(args.p_undo_step).toMatchObject({ id: stepId, label_key: 'accountDeleted', label_params: { name: 'Wallet' } });
    expect(args.p_undo_step.ops[0]?.patch).toEqual({ deleted_at: null });
    expect(getToast()).toMatchObject({ kind: 'destructive', stepId });
    expect((qc.getQueryData(queryKeys.accounts('h1')) as { id: string }[]).map((a) => a.id)).toEqual(['a2']);
  });

  it('restores the account and shows a refusal when the guard rejects (23514)', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'account in use', code: '23514' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper: wrapper(qc) });

    result.current.remove(account, ctx);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect((qc.getQueryData(queryKeys.accounts('h1')) as { id: string }[]).map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ entity: 'accounts', kind: 'rejected', code: '23514' }));
    expect(getToast()?.kind).toBe('refusal');
  });
});
