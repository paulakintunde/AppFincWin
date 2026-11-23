// 10-26 (IMP-06, D-23): a wallet import commits payments at gross, each fee as its own linked
// expense and each conversion as a transfer, all in one chunk flow and one undo step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, NewTransaction } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { readWallet, walletToDrafts } from '@/engine/statement';
import { csv, REVOLUT_HEADER, revolutRow } from '@/engine/statement/__tests__/wallets/synthetic';
import { clearVersionChains } from '@/data/sync/versionChain';
import { buildWalletCommit } from '@/features/record/import/walletModel';
import { registerImportFinalizeMutations, useImportCommit, type ImportCommitInput } from '../importFinalize';
import * as transactionsModule from '../transactions';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/importProfiles', () => ({ saveImportProfile: jest.fn(async () => undefined) }));
// expo-crypto has no randomUUID under jest; the hook mints one transfer id per conversion.
let mockIdCounter = 0;
jest.mock('../undoCapture', () => ({
  ...jest.requireActual('../undoCapture'),
  newStepId: () => `xfer-${(mockIdCounter += 1)}`,
}));
jest.mock('../transactions', () => ({
  ...jest.requireActual('../transactions'),
  useImportChunks: jest.fn(),
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerImportFinalizeMutations(qc);
  return qc;
}

// Three payments (one with a 0.30 fee) and one EUR to GBP conversion (0.50 fee), the 10-26 acceptance shape.
function commitInput(): { input: ImportCommitInput; built: ReturnType<typeof buildWalletCommit> } {
  const text = csv(REVOLUT_HEADER, [
    revolutRow({ description: 'Bakery', amount: '-12.50', fee: '0.30', currency: 'EUR', date: '2026-03-06 09:00:00' }),
    revolutRow({ description: 'Salary', amount: '300.00', currency: 'EUR', date: '2026-03-07 09:00:00' }),
    revolutRow({ description: 'Cafe', amount: '-4.00', currency: 'GBP', date: '2026-03-08 09:00:00' }),
    revolutRow({ type: 'EXCHANGE', description: 'Exchanged to GBP', amount: '-100.00', fee: '0.50', currency: 'EUR', date: '2026-03-05 10:00:00' }),
    revolutRow({ type: 'EXCHANGE', description: 'Exchanged from EUR', amount: '85.10', currency: 'GBP', date: '2026-03-05 10:00:00' }),
  ]);
  const read = readWallet(text);
  if (read === null || !read.ok) throw new Error('fixture must read');
  let n = 0;
  const built = buildWalletCommit({
    drafts: walletToDrafts(read),
    accountByCurrency: new Map([['EUR', 'acc-eur'], ['GBP', 'acc-gbp']]),
    householdId: 'h1',
    timeZone: 'UTC',
    batchId: 'batch-1',
    feesCategoryId: 'fees-cat',
    transferCategoryId: 'xfer-cat',
    newId: () => `w${(n += 1)}`,
  });
  return {
    built,
    input: {
      householdId: 'h1',
      userId: 'user-1',
      homeCurrency: 'EUR',
      batchId: 'batch-1',
      stepId: 'step-1',
      rows: built.rows,
      walletFees: built.walletFees,
      walletPairs: built.walletPairs,
      finalize: { transferCategoryId: 'xfer-cat', links: [], markPaid: [], limit: null, profile: null },
    },
  };
}

beforeEach(() => {
  clearVersionChains();
  (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue: jest.fn() });
});

describe('wallet commit (10-26)', () => {
  it('inserts 3 payments + 2 conversion legs + 2 fee expenses in one enqueue, fees linked and legs paired', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(newClient()) });
    const { input, built } = commitInput();

    result.current.commit(input);

    const sent = (enqueue.mock.calls[0]?.[0] as { rows: NewTransaction[] }).rows;
    expect(sent).toHaveLength(7);
    const fees = sent.filter((r) => r.fx_fee_of);
    expect(fees).toHaveLength(2);
    expect(fees.every((f) => f.category_id === 'fees-cat' && f.original_amount < 0)).toBe(true);
    for (const f of built.walletFees) expect(sent.find((r) => r.id === f.row.id)?.fx_fee_of).toBe(f.forRowId);

    const pair = built.walletPairs[0]!;
    const from = sent.find((r) => r.id === pair.fromRowId)!;
    const to = sent.find((r) => r.id === pair.toRowId)!;
    expect(from.transfer_id).toBeTruthy();
    expect(from.transfer_id).toBe(to.transfer_id);
    expect([from.category_id, to.category_id]).toEqual(['xfer-cat', 'xfer-cat']);
    expect(sent.filter((r) => r.transfer_id)).toHaveLength(2);
    expect(sent.every((r) => r.import_batch_id === 'batch-1')).toBe(true);
  });

  it("per currency, the sum of inserted amounts equals the file's net movement", async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(newClient()) });

    result.current.commit(commitInput().input);

    const sent = (enqueue.mock.calls[0]?.[0] as { rows: NewTransaction[] }).rows;
    const sum = (acct: string): number => sent.filter((r) => r.account_id === acct).reduce((a, r) => a + r.original_amount, 0);
    expect(sum('acc-eur')).toBe(-1250 - 30 + 30000 - 10000 - 50);
    expect(sum('acc-gbp')).toBe(-400 + 8510);
  });

  it('one undo step, "imported", names every inserted row including fees and both conversion legs', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(newClient()) });
    const { input } = commitInput();

    result.current.commit(input);

    await waitFor(() => expect(fake.calls.some((c) => c.table === 'undo_log' && c.method === 'insert')).toBe(true));
    const steps = fake.calls.filter((c) => c.table === 'undo_log' && c.method === 'insert');
    expect(steps).toHaveLength(1);
    const step = steps[0]?.args[0] as { label_key: string; label_params: { n: number }; ops: { id: string }[] };
    expect(step.label_key).toBe('imported');
    expect(step.label_params).toEqual({ n: 7 });
    expect(step.ops.map((o) => o.id).sort()).toEqual(
      [...input.rows, ...(input.walletFees ?? []).map((f) => f.row)].map((r) => r.id).sort()
    );
  });

  it('refuses a conversion before anything is enqueued when no Transfer category is known', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(newClient()) });
    const { input } = commitInput();

    expect(() => result.current.commit({ ...input, finalize: { ...input.finalize, transferCategoryId: null } })).toThrow(TypeError);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a fee with no payment line of its own is inserted unlinked', async () => {
    const enqueue = jest.fn();
    (transactionsModule.useImportChunks as jest.Mock).mockReturnValue({ enqueue });
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: null, status: 201 });
    const { result } = await renderHook(() => useImportCommit(), { wrapper: wrapper(newClient()) });
    const fee: NewTransaction = {
      id: 'f1', household_id: 'h1', account_id: 'a', original_amount: -50, original_currency: 'EUR', local_date: '2026-03-01', time_zone: 'UTC', note: null,
    };

    result.current.commit({
      householdId: 'h1', userId: 'user-1', homeCurrency: 'EUR', batchId: 'b', stepId: 's', rows: [],
      walletFees: [{ forRowId: null, row: fee }],
      finalize: { transferCategoryId: null, links: [], markPaid: [], limit: null, profile: null },
    });

    const sent = (enqueue.mock.calls[0]?.[0] as { rows: NewTransaction[] }).rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]?.fx_fee_of).toBeUndefined();
  });
});
