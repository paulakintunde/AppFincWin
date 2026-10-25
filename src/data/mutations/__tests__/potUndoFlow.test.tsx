// Device bug (2026-10-24): tapping Undo on "Pot saved" closed the toast but the server never applied the step.
// Drives the real chain the toast uses: add pot (inserts the step) -> useUndo with the toast's step id -> apply_undo_step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { registerMutationDefaults } from '@/data/mutations';
import { resetToastForTests } from '@/state/undoToast';
import { useAddPot } from '../decidePots';
import { useUndo } from '../undo';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('pot add then Undo', () => {
  it('sends apply_undo_step with the same step id the add recorded', async () => {
    onlineManager.setOnline(true);
    resetToastForTests();
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    registerMutationDefaults(qc);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => ({ add: useAddPot(), undo: useUndo() }), { wrapper });
    const addOnly = await renderHook(() => useAddPot(), { wrapper }); // the PotSheet: unmounts once it has saved

    fake.respondWith(ok({ id: 'x', household_id: 'h1', created_by: 'u1', version: 1, kind: 'pot', name: 'P', currency: 'GBP', target: 1, ready_by: '2027-01-31', opening_saved: 0, monthly_amount: null, check_id: null, done_at: null, is_sample: false, deleted_at: null, created_at: 'a', updated_at: 'a' })); // pot insert
    fake.respondWith(ok(null)); // undo_log insert
    const { stepId } = addOnly.result.current.add({ householdId: 'h1', ownerId: 'u1', pot: { name: 'P', currency: 'GBP', target: 1, ready_by: '2027-01-31', opening_saved: 0 } });
    addOnly.unmount();
    // The user can tap Undo before the add has finished: the undo queues behind it in the write scope.
    fake.respondWith(ok({ status: 'undone' }));
    result.current.undo.undo({ stepId, ownerId: 'u1', householdId: 'h1', labelKey: 'potAdded', labelParams: { name: 'P' } });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(fake.calls.filter((c) => ['insert', 'rpc'].includes(c.method)).map((c) => [c.table ?? null, c.method])).toEqual([
      ['savings_goals', 'insert'],
      ['undo_log', 'insert'],
      [null, 'rpc'],
    ]);
    expect(fake.calls.find((c) => c.method === 'rpc')?.args).toEqual(['apply_undo_step', { p_step_id: stepId }]);
  });
});
