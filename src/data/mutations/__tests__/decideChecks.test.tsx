// 05-19: Decide check writes through the queue. Autosave has no undo step; abandon and remove do.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import {
  registerDecideCheckMutations,
  useAbandonCheck,
  useCreateCheck,
  useMarkCheckSeen,
  useReopenCheck,
  useReopenRedirect,
  useRemoveDecision,
  useSaveCheckDraft,
  type CreateCheckVars,
} from '../decideChecks';
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

const KEY = queryKeys.decideChecks('user-1', 'hh-1');
const GOAL_KEY = queryKeys.savingsGoals('user-1', 'hh-1');

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

const goal = (overrides: Partial<SavingsGoalRow> = {}): SavingsGoalRow => ({
  id: 'g1',
  household_id: 'hh-1',
  created_by: 'user-1',
  check_id: 'c1',
  name: 'Laptop',
  currency: 'USD',
  target: 100000,
  monthly_amount: 10000,
  ready_by: null,
  opening_saved: 0,
  is_sample: false,
  deleted_at: null,
  version: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function lastStep(): { id: string; labelKey: string; labelParams: unknown; ops: { entity: string; expectedVersion: number; patch: unknown }[] } {
  return insertUndoStep.mock.calls[insertUndoStep.mock.calls.length - 1]![1];
}

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
  insertUndoStep.mockClear();
});

describe('useCreateCheck', () => {
  it('inserts an open check, adds it to the cache and records no undo step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(check('k1')));
    const { result } = await renderHook(() => useCreateCheck(), { wrapper: wrapper(qc) });

    result.current.create({
      userId: 'user-1',
      id: 'k1',
      householdId: 'hh-1',
      kind: 'buy',
      name: 'Laptop',
      inputs: { kind: 'buy' },
      furthestStep: 1,
    });
    await waitFor(() => expect(qc.getQueryData<WithPending<DecideCheckRow>[]>(KEY)?.[0]?.pending).toBeUndefined());

    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'k1',
      household_id: 'hh-1',
      kind: 'buy',
      name: 'Laptop',
      inputs: { kind: 'buy' },
      furthest_step: 1,
    });
    expect(qc.getQueryData<DecideCheckRow[]>(KEY)?.map((r) => r.id)).toEqual(['k1']);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('a duplicate client id on replay is success (the stored row comes back)', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(check('k1')));
    const { result } = await renderHook(() => useCreateCheck(), { wrapper: wrapper(qc) });

    result.current.create({ userId: 'user-1', id: 'k1', householdId: 'hh-1', kind: 'buy', name: 'Laptop', inputs: {}, furthestStep: 1 });
    await waitFor(() => expect(qc.getQueryData<WithPending<DecideCheckRow>[]>(KEY)?.[0]?.pending).toBeUndefined());
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('variables survive a JSON round trip', () => {
    const vars: CreateCheckVars = {
      userId: 'user-1',
      id: 'k1',
      householdId: 'hh-1',
      kind: 'invest',
      name: 'Index fund',
      inputs: { kind: 'invest', wait: { monthlyAmount: null } },
      furthestStep: 2,
      reopenedFrom: null,
    };
    expect(JSON.parse(JSON.stringify(vars))).toEqual(vars);
  });
});

describe('useSaveCheckDraft', () => {
  it('saves last-write-wins, patches the cache and records no undo step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1')]);
    fake.respondWith(ok([check('k1', { name: 'Laptop 2', furthest_step: 2, version: 2 })]));
    const { result } = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });

    result.current.save({ id: 'k1', name: 'Laptop 2', inputs: { kind: 'buy' }, furthestStep: 2 });
    await waitFor(() => expect(qc.getQueryData<DecideCheckRow[]>(KEY)?.[0]?.version).toBe(2));

    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ name: 'Laptop 2', furthest_step: 2, kind: 'buy' });
    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'open')).toBe(true);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('WR-A03: a queued abandon built on the version before an autosave resolves past it instead of conflicting', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1', { version: 3 })]);
    fake.respondWith(ok([check('k1', { name: 'Laptop 2', version: 4 })]));
    fake.respondWith(ok([check('k1', { deleted_at: '2026-10-02T00:00:00Z', version: 5 })]));
    const save = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });
    const abandon = await renderHook(() => useAbandonCheck(), { wrapper: wrapper(qc) });

    save.result.current.save({ id: 'k1', name: 'Laptop 2', inputs: { kind: 'buy' }, furthestStep: 2 });
    abandon.result.current.abandon(check('k1', { version: 3 }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version' && c.args[1] === 4)).toBe(true);
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(lastStep().ops).toEqual([expect.objectContaining({ entity: 'decide_checks', expectedVersion: 5 })]);
  });

  it('a decided or deleted check (not found) is parked as a failed write', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1')]);
    fake.respondWith(ok([]));
    const { result } = await renderHook(() => useSaveCheckDraft(), { wrapper: wrapper(qc) });

    result.current.save({ id: 'k1', name: 'Laptop', inputs: {}, furthestStep: 1 });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'decide_checks', entityId: 'k1', kind: 'not-found' });
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toContain('Laptop');
  });
});

describe('useAbandonCheck', () => {
  it('soft deletes, drops the row, records one checkAbandoned step restoring null and returns the step id', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1')]);
    fake.respondWith(ok([check('k1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useAbandonCheck(), { wrapper: wrapper(qc) });

    const stepId = result.current.abandon(check('k1'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(typeof (fake.calls.find((c) => c.method === 'update')?.args[0] as { deleted_at: string }).deleted_at).toBe('string');
    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version' && c.args[1] === 1)).toBe(true);
    expect(lastStep()).toMatchObject({
      id: stepId,
      labelKey: 'checkAbandoned',
      labelParams: { name: 'Laptop' },
      ops: [{ entity: 'decide_checks', expectedVersion: 2, patch: { deleted_at: null } }],
    });
    expect(qc.getQueryData<DecideCheckRow[]>(KEY)).toEqual([]);
  });

  it('puts the server row back on a version conflict and records ids only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1')]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(check('k1', { name: 'Server name', version: 5 })));
    const { result } = await renderHook(() => useAbandonCheck(), { wrapper: wrapper(qc) });

    result.current.abandon(check('k1'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'conflict', entity: 'decide_checks' });
    expect(qc.getQueryData<DecideCheckRow[]>(KEY)?.[0]).toMatchObject({ version: 5 });
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toContain('Laptop');
  });
});

describe('useMarkCheckSeen', () => {
  it('stores state and basis without an undo step, and does nothing when they already match', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([check('k1', { last_seen_state: 'fits', last_seen_basis: 'logged_months', version: 2 })]));
    const { result } = await renderHook(() => useMarkCheckSeen(), { wrapper: wrapper(qc) });

    expect(result.current.markSeen(check('k1'), 'fits', 'logged_months')).toBe(true);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({
      last_seen_state: 'fits',
      last_seen_basis: 'logged_months',
    });
    expect(
      result.current.markSeen(check('k1', { last_seen_state: 'fits', last_seen_basis: 'logged_months' }), 'fits', 'logged_months')
    ).toBe(false);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});

describe('useRemoveDecision', () => {
  it('soft deletes the decision with a decisionRemoved step and touches no lines', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1', { status: 'bought' })]);
    fake.respondWith(ok([check('k1', { status: 'bought', deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useRemoveDecision(), { wrapper: wrapper(qc) });

    result.current.remove(check('k1', { status: 'bought' }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(lastStep()).toMatchObject({ labelKey: 'decisionRemoved', ops: [{ entity: 'decide_checks', patch: { deleted_at: null } }] });
    expect(new Set(fake.calls.filter((c) => c.method === 'update').map((c) => c.table))).toEqual(new Set(['decide_checks']));
  });

  it('part 2 / WR-A04: a Wait decision and its goal are removed in ONE apply_patches call carrying the step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('c1', { status: 'waiting' })]);
    qc.setQueryData(GOAL_KEY, [goal()]);
    fake.respondWith(
      ok({ status: 'applied', rows: [{ entity: 'decide_checks', id: 'c1', version: 2 }, { entity: 'savings_goals', id: 'g1', version: 4 }] })
    );
    const { result } = await renderHook(() => useRemoveDecision(), { wrapper: wrapper(qc) });

    const stepId = result.current.remove(check('c1', { status: 'waiting' }), goal());
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));

    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(0);
    expect(insertUndoStep).not.toHaveBeenCalled();
    const rpcs = fake.calls.filter((c) => c.method === 'rpc');
    expect(rpcs).toHaveLength(1);
    const [name, params] = rpcs[0]!.args as [string, { p_ops: unknown[]; p_undo_step: { id: string; label_key: string; ops: unknown[] } }];
    expect(name).toBe('apply_patches');
    expect(params.p_ops).toEqual([
      expect.objectContaining({ entity: 'decide_checks', id: 'c1', expectedVersion: 1 }),
      expect.objectContaining({ entity: 'savings_goals', id: 'g1', expectedVersion: 3 }),
    ]);
    expect(params.p_undo_step).toMatchObject({ id: stepId, label_key: 'decisionRemoved' });
    expect(params.p_undo_step.ops).toEqual([
      expect.objectContaining({ entity: 'decide_checks', expectedVersion: 2, patch: { deleted_at: null } }),
      expect.objectContaining({ entity: 'savings_goals', expectedVersion: 4, patch: { deleted_at: null } }),
    ]);
    await waitFor(() => expect(qc.getQueryData<DecideCheckRow[]>(KEY)).toEqual([]));
    expect(qc.getQueryData<SavingsGoalRow[]>(GOAL_KEY)).toEqual([]);
  });

  it('WR-A04: a goal that changed elsewhere refuses both deletes together and parks a conflict', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('c1', { status: 'waiting' })]);
    qc.setQueryData(GOAL_KEY, [goal()]);
    fake.respondWith(
      ok({
        status: 'conflict',
        conflict: { entity: 'savings_goals', id: 'g1', updated_by: null, record_name: null, builtin_key: null, reason: 'changed' },
      })
    );
    const { result } = await renderHook(() => useRemoveDecision(), { wrapper: wrapper(qc) });

    result.current.remove(check('c1', { status: 'waiting' }), goal());
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'decide_checks', entityId: 'c1', kind: 'conflict' });
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(0);
    expect(insertUndoStep).not.toHaveBeenCalled();
    // the cache is refetched rather than patched with the conflict object
    expect(qc.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('ignores a goal that belongs to another check or is already deleted', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([check('c1', { deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useRemoveDecision(), { wrapper: wrapper(qc) });

    result.current.remove(check('c1'), goal({ check_id: 'other' }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(1);
  });
});

describe('useReopenCheck', () => {
  it('creates a new open check from the inputs with the outcome and wait amount reset', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(check('id-1', { reopened_from: 'k1' })));
    const { result } = await renderHook(() => useReopenCheck(), { wrapper: wrapper(qc) });

    const id = result.current.reopen(
      check('k1', {
        status: 'waiting',
        furthest_step: 4,
        inputs: { kind: 'buy', outcome: 'wait', wait: { monthlyAmount: 25000 }, why: 'x' },
      }),
      '2026-10-10'
    );
    expect(id).toBe('id-1');
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));

    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      id: 'id-1',
      reopened_from: 'k1',
      inputs: { kind: 'buy', outcome: null, wait: { monthlyAmount: null }, why: 'x' },
    });
  });

  it('IN-B05: a reopen refused by the one-live-reopen index lands on the live reopened check instead', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [check('k1', { status: 'passed' })]);
    fake.respondWith({ data: null, error: { message: 'duplicate key value violates unique constraint "decide_checks_reopened_once"', code: '23505' }, status: 409 });
    fake.respondWith({ data: null, error: null, status: 200 }); // the tried id never landed
    fake.respondWith(ok(check('live-1', { reopened_from: 'k1' })));
    const { result } = await renderHook(() => useReopenCheck(), { wrapper: wrapper(qc) });
    const tried = result.current.reopen(check('k1', { status: 'passed' }), '2026-10-10');
    const redirect = await renderHook(() => useReopenRedirect(tried), { wrapper: wrapper(qc) });
    await waitFor(() => expect(redirect.result.current).toBe('live-1'));
    const ids = (qc.getQueryData<DecideCheckRow[]>(KEY) ?? []).map((r) => r.id);
    expect(ids).toContain('live-1');
    expect(ids).not.toContain(tried);
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['reopened_from', 'k1']);
  });
});
