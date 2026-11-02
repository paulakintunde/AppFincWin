// 05.3-100: repeated reopen copies, redirects and the copy-not-saved store.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import * as undoToast from '@/state/undoToast';
import { resetToastForTests } from '@/state/undoToast';
import { registerDecideCheckMutations, useReopenCheck, useReopenFailed, useReopenRedirect } from '../decideChecks';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `reopen-id-${++mockUuid}`),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
  dismissFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const KEY = queryKeys.decideChecks('user-1', 'hh-1');

const check = (id: string, overrides: Partial<DecideCheckRow> = {}): DecideCheckRow => ({
  id,
  household_id: 'hh-1',
  created_by: 'user-1',
  kind: 'buy',
  name: 'Laptop',
  inputs: { kind: 'buy', outcome: null, wait: { monthlyAmount: null } },
  status: 'open',
  furthest_step: 1,
  last_seen_state: null,
  last_seen_basis: null,
  answer_v3: null,
  reopened_from: null,
  decided_at: null,
  verdict_at_decision: null,
  estimate_day_one: null,
  estimate_monthly: null,
  wait_monthly: null,
  ready_by: null,
  broke_line: false,
  cooling_off_at: null,
  estimate_monthly_payment: null,
  estimate_running: null,
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
  registerDecideCheckMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('reopening one decision many times', () => {
  it('three reopens make three distinct copies, each linked to the source, with no failure and no redirect', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1', { status: 'passed' })]);
    fake.respondWith(ok(check('reopen-id-1', { reopened_from: 'k1' })));
    fake.respondWith(ok(check('reopen-id-2', { reopened_from: 'k1' })));
    fake.respondWith(ok(check('reopen-id-3', { reopened_from: 'k1' })));
    const { result } = await renderHook(() => useReopenCheck(), { wrapper: wrapper(qc) });
    const ids = [1, 2, 3].map(() => result.current.reopen(check('k1', { status: 'passed' })));
    expect(new Set(ids).size).toBe(3);
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(3));
    expect(
      fake.calls.filter((c) => c.method === 'insert').map((c) => (c.args[0] as { reopened_from: string }).reopened_from)
    ).toEqual(['k1', 'k1', 'k1']);
    expect(recordFailedWrite).not.toHaveBeenCalled();
    const outcomes = await renderHook(() => ids.map((i) => [useReopenRedirect(i), useReopenFailed(i)]), {
      wrapper: wrapper(qc),
    });
    expect(outcomes.result.current).toEqual([
      [null, false],
      [null, false],
      [null, false],
    ]);
  });

  it('a pre-push server that refuses the second copy redirects the tried id to the live copy', async () => {
    const { fake, qc } = setup();
    fake.respondWith({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "decide_checks_reopened_once"', code: '23505' },
      status: 409,
    });
    fake.respondWith({ data: null, error: null, status: 200 });
    fake.respondWith(ok(check('live-1', { reopened_from: 'k1' })));
    const { result } = await renderHook(() => useReopenCheck(), { wrapper: wrapper(qc) });
    const tried = result.current.reopen(check('k1', { status: 'passed' }));
    const redirect = await renderHook(() => useReopenRedirect(tried), { wrapper: wrapper(qc) });
    await waitFor(() => expect(redirect.result.current).toBe('live-1'));
  });

  it('a refused copy marks the id failed, parks the create with reopenedFrom and says the copy did not save', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useReopenCheck(), { wrapper: wrapper(qc) });
    const tried = result.current.reopen(check('k1', { status: 'passed' }));
    const failed = await renderHook(() => useReopenFailed(tried), { wrapper: wrapper(qc) });
    await waitFor(() => expect(failed.result.current).toBe(true));
    expect(undoToast.getToast()).toMatchObject({ kind: 'refusal', text: { key: 'sync.checkCopyNotSaved' } });
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'decide_checks',
      entityId: tried,
      attempted: { op: 'create', reopenedFrom: 'k1' },
    });
  });
});
