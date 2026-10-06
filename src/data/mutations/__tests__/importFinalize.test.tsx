// Task 3 (RED): the import finalize write -- one atomic apply_patches call for accepted
// links/mark-paid/limit plus the import's single post-link undo step (D-16, D-24, D-48,
// D-50, D-52, D-55), and chunkKeepingPairs's D-52 "never split a transfer pair" guarantee.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, NewTransaction } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerImportFinalizeMutations, useImportCommit, chunkKeepingPairs, type ImportCommitInput } from '../importFinalize';
import * as transactionsModule from '../transactions';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

jest.mock('@/db/importProfiles', () => ({
  saveImportProfile: jest.fn(async () => undefined),
}));

// useImportChunks is Task 2's own concern (already tested in transactions.test.tsx) --
// mocked here so importFinalize's tests isolate the finalize write's own behavior.
jest.mock('../transactions', () => ({
  ...jest.requireActual('../transactions'),
  useImportChunks: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveImportProfile } = require('@/db/importProfiles') as { saveImportProfile: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerImportFinalizeMutations(qc);
  return qc;
}

function newTx(id: string, overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    id,
    household_id: 'h1',
    account_id: 'acc1',
    original_amount: -500,
    original_currency: 'USD',
    local_date: '2026-09-24',
    time_zone: 'UTC',
    note: null,
    status: 'paid',
    import_batch_id: 'batch-1',
    ...overrides,
  };
}

const baseInput = (overrides: Partial<ImportCommitInput['finalize']> = {}, rows?: NewTransaction[]): ImportCommitInput => ({
  householdId: 'h1',
  userId: 'user-1',
  homeCurrency: 'USD',
  batchId: 'batch-1',
  stepId: 'step-1',
  rows: rows ?? [newTx('n2'), newTx('n3')],
  finalize: {
    transferCategoryId: null,
    links: [],
    markPaid: [],
    limit: null,
    profile: null,
    ...overrides,
  },
});

beforeEach(() => {
  clearVersionChains();
  recordFailedWrite.mockClear();
  saveImportProfile.mockClear();
  saveImportProfile.mockResolvedValue(undefined);
  (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue: jest.fn() });
});

describe('chunkKeepingPairs', () => {
  const row = (id: string, transferId?: string): NewTransaction => newTx(id, transferId ? { transfer_id: transferId } : {});

  it('splits 1001 unlinked rows into 3 chunks of at most 500, preserving order', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(`r${i}`));
    const chunks = chunkKeepingPairs(rows, 500);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(1);
    expect(chunks.flat().map((r) => r.id)).toEqual(rows.map((r) => r.id));
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500);
  });

  it('never puts two rows sharing a transfer_id in different chunks', () => {
    const rows = [...Array.from({ length: 499 }, (_, i) => row(`r${i}`)), row('leg-a', 'T1'), row('leg-b', 'T1'), row('r-extra')];
    const chunks = chunkKeepingPairs(rows, 500);

    const chunkOf = (id: string) => chunks.findIndex((c) => c.some((r) => r.id === id));
    expect(chunkOf('leg-a')).toBe(chunkOf('leg-b'));
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500);
  });
});

describe('useImportCommit', () => {
  it('enqueues the chunks via useImportChunks and mutates one importFinalize call', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 }); // insertUndoStep (no links/markPaid/limit)

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(baseInput());

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: 'h1', batchId: 'batch-1', homeCurrency: 'USD', userId: 'user-1' })
    );
    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    // Task 2's chunk mutation never ran here (useImportChunks is mocked) -- only the finalize
    // write touched the fake client.
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
  });

  // C-WR-09: batch provenance (REC-14) must not depend on the UI remembering to set it.
  it('stamps the batch id onto every row it enqueues, whatever the caller sent', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 }); // insertUndoStep

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(baseInput({}, [newTx('n2', { import_batch_id: undefined }), newTx('n3', { import_batch_id: 'stale' })]));

    const sent = (enqueue.mock.calls[0]?.[0] as { rows: NewTransaction[] }).rows;
    expect(sent.map((r) => r.import_batch_id)).toEqual(['batch-1', 'batch-1']);
    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
  });

  it('throws before mutate (and before enqueuing) when links are present but transferCategoryId is missing', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    expect(() =>
      result.current.commit(
        baseInput({
          links: [{ importedId: 'n2', importedCategoryId: null, storedId: 's1', storedVersion: 4, storedCategoryId: null, transferId: 'T' }],
        })
      )
    ).toThrow(TypeError);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('with no links, mark-paid or limit, sends no apply_patches and inserts the undo step directly with every inserted id at version 1', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(baseInput());

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);

    const insertCall = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
    const payload = insertCall?.args[0] as { label_key: string; label_params: { n: number }; ops: unknown[] };
    expect(payload.label_key).toBe('imported');
    expect(payload.label_params).toEqual({ n: 2 });
    expect(payload.ops).toEqual([
      { entity: 'transactions', id: 'n2', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'n3', expectedVersion: 1, patch: { deleted_at: '$now' } },
    ]);
  });

  it('with links, mark-paid and a limit, sends ONE apply_patches call with the exact ops and the post-link undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: {
        status: 'applied',
        rows: [
          { entity: 'transactions', id: 'n2', version: 2 },
          { entity: 'transactions', id: 's1', version: 5 },
          { entity: 'transactions', id: 'p1', version: 3 },
          { entity: 'accounts', id: 'a1', version: 4 },
        ],
      },
      error: null,
      status: 200,
    });

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({
        transferCategoryId: 'transfer-cat',
        links: [{ importedId: 'n2', importedCategoryId: null, storedId: 's1', storedVersion: 4, storedCategoryId: 'c-old', transferId: 'T' }],
        markPaid: [
          {
            pendingId: 'p1',
            expectedVersion: 2,
            before: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
            patch: { status: 'paid', local_date: '2026-09-04', original_amount: -1150 },
            line: newTx('line-p1', { local_date: '2026-09-04', original_amount: -1150 }),
          },
        ],
        limit: { accountId: 'a1', expectedVersion: 3, before: { credit_limit: null }, patch: { credit_limit: 100000 } },
      })
    );

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));

    const rpcCall = fake.calls.find((c) => c.method === 'rpc');
    const [name, args] = rpcCall?.args as [
      string,
      { p_ops: unknown[]; p_undo_step: { label_key: string; label_params: { n: number }; ops: unknown[] } },
    ];
    expect(name).toBe('apply_patches');
    expect(args.p_ops).toEqual([
      { entity: 'transactions', id: 'n2', expectedVersion: 1, patch: { transfer_id: 'T', category_id: 'transfer-cat' } },
      { entity: 'transactions', id: 's1', expectedVersion: 4, patch: { transfer_id: 'T', category_id: 'transfer-cat' } },
      { entity: 'transactions', id: 'p1', expectedVersion: 2, patch: { status: 'paid', local_date: '2026-09-04', original_amount: -1150 } },
      { entity: 'accounts', id: 'a1', expectedVersion: 3, patch: { credit_limit: 100000 } },
    ]);
    expect(args.p_undo_step.label_key).toBe('imported');
    expect(args.p_undo_step.label_params).toEqual({ n: 3 }); // 2 inserted + 1 mark-paid
    expect(args.p_undo_step.ops).toEqual([
      { entity: 'transactions', id: 'n2', expectedVersion: 2, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'n3', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 's1', expectedVersion: 5, patch: { transfer_id: null, category_id: 'c-old' } },
      { entity: 'transactions', id: 'p1', expectedVersion: 3, patch: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 } },
      { entity: 'accounts', id: 'a1', expectedVersion: 4, patch: { credit_limit: null } },
    ]);
  });

  it('on success invalidates transactionsRoot/accounts/undoLog, then saves the remembered profile best-effort', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({ profile: { accountId: 'acc1', signature: 'sig-1', id: 'profile-1', profile: {
        version: 1, source: 'csv', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'held', statedLimit: null, decidedBy: 'user',
      } } })
    );

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.accounts('h1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('user-1') });

    await waitFor(() =>
      expect(saveImportProfile).toHaveBeenCalledWith(
        fake,
        expect.objectContaining({ id: 'profile-1', ownerId: 'user-1', accountId: 'acc1', signature: 'sig-1' })
      )
    );
  });

  it("a failed saveImportProfile is swallowed -- never reaches the failed-writes list", async () => {
    saveImportProfile.mockRejectedValueOnce(new Error('profile save failed'));
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({ profile: { accountId: 'acc1', signature: 'sig-1', id: 'profile-1', profile: {
        version: 1, source: 'csv', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'held', statedLimit: null, decidedBy: 'user',
      } } })
    );

    await waitFor(() => expect(saveImportProfile).toHaveBeenCalled());
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  // C-CR-01: a conflict no longer fails the whole finalize. The conflicting suggestion is set
  // aside, the rest is sent again, the import's undo step is always recorded, and what was set
  // aside is reported with ids and counts only (T-02-15-07).
  it('a version conflict on a stored leg sets that link aside, still records the undo step, and reports ids and counts only', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 's1', updated_by: 'Sam', record_name: 'Groceries', builtin_key: null, reason: 'changed' },
      },
      error: null,
      status: 200,
    });
    fake.respondWith({ data: null, error: null, status: 201 }); // insertUndoStep: nothing left to patch

    const qc = newClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({
        transferCategoryId: 'transfer-cat',
        links: [{ importedId: 'n2', importedCategoryId: null, storedId: 's1', storedVersion: 4, storedCategoryId: null, transferId: 'T' }],
      })
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'transactions',
      entityId: 'import:batch-1',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { import_batch_id: 'batch-1', stage: 'finalize', links: 1, markPaid: 0, limit: 0, recordedAsLines: 0, ids: ['s1'] },
    });
    // The undo step still covers both inserted rows, n2 back at version 1 (never linked).
    const undoInsert = fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
    expect((undoInsert?.args[0] as { ops: unknown[] }).ops).toEqual([
      { entity: 'transactions', id: 'n2', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'n3', expectedVersion: 1, patch: { deleted_at: '$now' } },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
  });

  it('C-CR-01: a conflict on a mark-paid bill records its statement line as an ordinary row, in the undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 'p1', updated_by: 'Sam', record_name: 'Netflix', builtin_key: null, reason: 'changed' },
      },
      error: null,
      status: 200,
    });
    fake.respondWith({ data: [{ id: 'line-p1', local_date: '2026-09-04', version: 1, rate_pending: false }], error: null, status: 201 }); // fallback line
    fake.respondWith({ data: { status: 'applied', rows: [{ entity: 'accounts', id: 'a1', version: 4 }] }, error: null, status: 200 });

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({
        markPaid: [
          {
            pendingId: 'p1',
            expectedVersion: 2,
            before: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
            patch: { status: 'paid', local_date: '2026-09-04', original_amount: -1150 },
            line: newTx('line-p1', { local_date: '2026-09-04', original_amount: -1150 }),
          },
        ],
        limit: { accountId: 'a1', expectedVersion: 3, before: { credit_limit: null }, patch: { credit_limit: 100000 } },
      })
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));

    // The line was inserted as an ordinary row, with the batch's provenance.
    const upsert = fake.calls.find((c) => c.table === 'transactions' && c.method === 'upsert');
    expect((upsert?.args[0] as { id: string; import_batch_id: string }[]).map((r) => [r.id, r.import_batch_id])).toEqual([
      ['line-p1', 'batch-1'],
    ]);

    // The second apply_patches carries only the limit, and the undo step covers the line.
    const rpcs = fake.calls.filter((c) => c.method === 'rpc');
    expect(rpcs).toHaveLength(2);
    const [, args] = rpcs[1]?.args as [string, { p_ops: { id: string }[]; p_undo_step: { label_params: { n: number }; ops: unknown[] } }];
    expect(args.p_ops.map((o) => o.id)).toEqual(['a1']);
    expect(args.p_undo_step.label_params).toEqual({ n: 3 });
    expect(args.p_undo_step.ops).toEqual([
      { entity: 'transactions', id: 'n2', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'n3', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'transactions', id: 'line-p1', expectedVersion: 1, patch: { deleted_at: '$now' } },
      { entity: 'accounts', id: 'a1', expectedVersion: 4, patch: { credit_limit: null } },
    ]);

    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'conflict',
        attempted: { import_batch_id: 'batch-1', stage: 'finalize', links: 0, markPaid: 1, limit: 0, recordedAsLines: 1, ids: ['p1'] },
      })
    );
  });

  it('C-CR-01: a link to a row whose chunk was rejected (not-found) is set aside; the mark-paid still applies', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 'n2', updated_by: null, record_name: null, builtin_key: null, reason: 'not-found' },
      },
      error: null,
      status: 200,
    });
    fake.respondWith({ data: { status: 'applied', rows: [{ entity: 'transactions', id: 'p1', version: 3 }] }, error: null, status: 200 });

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({
        transferCategoryId: 'transfer-cat',
        links: [{ importedId: 'n2', importedCategoryId: null, storedId: 's1', storedVersion: 4, storedCategoryId: null, transferId: 'T' }],
        markPaid: [
          {
            pendingId: 'p1',
            expectedVersion: 2,
            before: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
            patch: { status: 'paid', local_date: '2026-09-04', original_amount: -1150 },
            line: newTx('line-p1'),
          },
        ],
      })
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const rpcs = fake.calls.filter((c) => c.method === 'rpc');
    expect(rpcs).toHaveLength(2);
    const [, args] = rpcs[1]?.args as [string, { p_ops: { id: string }[] }];
    expect(args.p_ops.map((o) => o.id)).toEqual(['p1']); // the bill is still marked paid
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(false); // so its line is not inserted
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        attempted: { import_batch_id: 'batch-1', stage: 'finalize', links: 1, markPaid: 0, limit: 0, recordedAsLines: 0, ids: ['n2'] },
      })
    );
  });

  it('C-CR-01: when the finalize cannot run at all, its mark-paid lines are kept in the failed write, not lost', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: 'not an envelope', error: null, status: 200 }); // unreadable: may have committed

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    const line = newTx('line-p1', { local_date: '2026-09-04', original_amount: -1150 });
    result.current.commit(
      baseInput({
        markPaid: [
          {
            pendingId: 'p1',
            expectedVersion: 2,
            before: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
            patch: { status: 'paid', local_date: '2026-09-04', original_amount: -1150 },
            line,
          },
        ],
      })
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(false); // never degraded on an unreadable answer
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'rejected',
        attempted: expect.objectContaining({ stage: 'finalize', markPaid: 1, unrecordedLines: [line] }),
      })
    );
  });

  it('a 23514 (pair trigger) rejection sets every suggestion aside and is recorded with the code from the underlying error', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'pair trigger violation', code: '23514' }, status: 400 });
    fake.respondWith({ data: null, error: null, status: 201 }); // insertUndoStep

    const qc = newClient();
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(qc) });

    result.current.commit(
      baseInput({
        transferCategoryId: 'transfer-cat',
        links: [{ importedId: 'n2', importedCategoryId: null, storedId: 's1', storedVersion: 4, storedCategoryId: null, transferId: 'T' }],
      })
    );

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'transactions',
      entityId: 'import:batch-1',
      kind: 'rejected',
      code: '23514',
      attempted: { import_batch_id: 'batch-1', stage: 'finalize', links: 1, markPaid: 0, limit: 0, recordedAsLines: 0, ids: [] },
    });
    // C-CR-01: the import's undo step is still recorded for the rows that landed.
    expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true);
  });
});
