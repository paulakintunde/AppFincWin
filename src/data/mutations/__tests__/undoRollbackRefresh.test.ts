// 05.3-111: History always refreshes after an undo or rollback, and a refused rollback is parked with the change's name.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { registerMutationDefaults } from '@/data/mutations';
import { queryKeys } from '@/data/keys';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { resetToastForTests } from '@/state/undoToast';
import type { UndoLogRow } from '@/db/rows';
import { useRollbackUndo } from '../undo';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

jest.setTimeout(60000);

const row = (id: string, label_key: string, name?: string): UndoLogRow =>
  ({
    id,
    owner_id: 'u1',
    label_key,
    label_params: name ? { name } : {},
    status: 'available',
    refusal: null,
    created_at: '2026-01-01T00:00:00Z',
    resolved_at: null,
  }) as UndoLogRow;

async function run(rpcData: unknown, log: UndoLogRow[] | undefined) {
  onlineManager.setOnline(true);
  resetToastForTests();
  (recordFailedWrite as jest.Mock).mockClear();
  mockActiveClient = {
    rpc: () => ({ then: (f: (v: unknown) => unknown) => Promise.resolve({ data: rpcData, error: null, status: 200 }).then(f) }),
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) },
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.undoLog('u1');
  if (log) qc.setQueryData(key, log);
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  registerMutationDefaults(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
  const { result } = await renderHook(() => useRollbackUndo(), { wrapper });
  result.current.rollbackTo({ stepId: 's2', ownerId: 'u1', householdId: 'h1' });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }), { timeout: 20000 });
  return { qc, invalidate, key };
}

it.each([
  ['undone', { status: 'undone', undone: 2 }],
  ['not-found', { status: 'not-found' }],
])('refreshes the undo log after %s', async (_n, data) => {
  const { invalidate, key } = await run(data, [row('s1', 'added', 'A'), row('s2', 'added', 'B'), row('s3', 'added', 'C')]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});

it('hides the rolled-back rows at once (target and newer), keeping older ones', async () => {
  const { qc, key } = await run({ status: 'not-found' }, [row('s1', 'added', 'A'), row('s2', 'added', 'B'), row('s3', 'added', 'C')]);
  // set optimistically in onMutate; the refetch has no query fn here so the cache keeps what onMutate wrote
  expect((qc.getQueryData(key) as UndoLogRow[]).map((r) => r.id)).toEqual(['s3']);
});

it('a refused rollback parks a failed write that names the change', async () => {
  await run(
    { status: 'refused', undone: 0, step_id: 's1', refusal: { entity: 'transactions', id: 't1', updated_by: 'sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' } },
    [row('s1', 'answerSaved', 'It’s spare'), row('s2', 'added', 'B')]
  );
  await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
  expect((recordFailedWrite as jest.Mock).mock.calls[0][0].attempted).toEqual(
    expect.objectContaining({ stepId: 's1', labelKey: 'answerSaved', name: 'It’s spare' })
  );
});

it('with no cached row the failed write carries the step id only', async () => {
  await run({ status: 'refused', undone: 0, step_id: 's1', refusal: { entity: 'transactions', id: 't1', updated_by: 'sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' } }, undefined);
  await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
  const attempted = (recordFailedWrite as jest.Mock).mock.calls[0][0].attempted;
  expect(attempted.labelKey).toBeUndefined();
  expect(attempted.stepId).toBe('s1');
});
