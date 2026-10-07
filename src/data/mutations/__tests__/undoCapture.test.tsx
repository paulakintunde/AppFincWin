// Task 1 (RED): recordUndoStepSafely records immediately or queues the step as its own
// mutation on failure, without ever retrying the forward write it was called from (D-29).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { DbError } from '@/db/errors';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { buildStep, inverseOfInserts } from '@/engine/undo';
import { registerUndoCaptureMutations, recordUndoStepSafely } from '../undoCapture';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('@/db/undoLog', () => ({
  insertUndoStep: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerUndoCaptureMutations(qc);
  return qc;
}

const step = buildStep('step-1', 'deleted', { name: 'Groceries' }, inverseOfInserts('transactions', [{ id: 'tx-1', version: 1 }]));

beforeEach(() => {
  insertUndoStep.mockReset();
});

describe('recordUndoStepSafely', () => {
  it('calls insertUndoStep directly and invalidates undoLog on success', async () => {
    insertUndoStep.mockResolvedValueOnce(undefined);
    const qc = newClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const fake = createFakeSupabase() as FakeSupabase & DbClient;

    await recordUndoStepSafely(qc, fake, step, 'user-1');

    expect(insertUndoStep).toHaveBeenCalledWith(fake, step);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('user-1') });
  });

  it('queues a recordUndoStep mutation with the same step when the direct write throws, and resolves without throwing', async () => {
    insertUndoStep.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const qc = newClient();
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    await expect(recordUndoStepSafely(qc, fake, step, 'user-1')).resolves.toBeUndefined();

    // The forward write is not retried -- only the queued path calls insertUndoStep again.
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(2));
    expect(insertUndoStep).toHaveBeenLastCalledWith(fake, step);
  });

  it('a queued attempt that resolves (insertUndoStep itself already treats a duplicate id as success) settles the mutation and invalidates undoLog', async () => {
    insertUndoStep.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const qc = newClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    await recordUndoStepSafely(qc, fake, step, 'user-1');

    await waitFor(() => {
      const mutations = qc.getMutationCache().getAll();
      expect(mutations.some((m) => m.state.status === 'success')).toBe(true);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('user-1') });
  });

  it('the recordUndoStep default retries a transient (5xx) error rather than failing immediately', async () => {
    // 1st call: the direct (non-queued) attempt inside recordUndoStepSafely -- any failure
    // here falls through to the queued path, no retry logic wraps it.
    insertUndoStep.mockRejectedValueOnce(new Error('offline'));
    // 2nd call: the queued mutation's first attempt -- a transient 5xx, which shouldRetryWrite
    // retries rather than failing the mutation outright.
    insertUndoStep.mockRejectedValueOnce(new DbError('trigger raised', 'XX000', 500));
    // 3rd call: the queued mutation's retry succeeds.
    insertUndoStep.mockResolvedValueOnce(undefined);

    const qc = newClient();
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;

    await recordUndoStepSafely(qc, fake, step, 'user-1');

    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(3), { timeout: 5000 });
    await waitFor(() => {
      const mutations = qc.getMutationCache().getAll();
      expect(mutations.some((m) => m.state.status === 'success')).toBe(true);
    });
  }, 10_000);
});
