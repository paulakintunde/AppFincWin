// 05-20 (D-10, D-11, D-34, D-35): Wait and save and Pass go through the queue; the reminder never blocks the save.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { registerDecideOutcomeMutations, usePass, useWaitAndSave } from '../decideOutcome';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;
const mockTrack = jest.fn();
const mockWait = jest.fn();
const mockCooling = jest.fn();

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleWaitReminder: (...a: unknown[]) => mockWait(...a),
  scheduleCoolingOffReminder: (...a: unknown[]) => mockCooling(...a),
}));

jest.setTimeout(60000);
const ok = (data: unknown) => ({ data, error: null, status: 200 });
const applied = () => ok({ status: 'applied' });

const CHECKS = queryKeys.decideChecks('u1', 'h1');
const GOALS = queryKeys.savingsGoals('u1', 'h1');

const check = { id: 'chk1', created_by: 'u1', household_id: 'h1', name: 'Sofa', inputs: { name: 'Sofa' } } as Pick<
  DecideCheckRow,
  'id' | 'created_by' | 'household_id' | 'name' | 'inputs'
>;

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideOutcomeMutations(qc);
  qc.setQueryData(CHECKS, [{ ...check, status: 'open', version: 1 }]);
  return qc;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  return fake;
}

const rpcArgs = (fake: FakeSupabase): Record<string, unknown> =>
  (fake.calls.find((c) => c.method === 'rpc')!.args as [string, Record<string, unknown>])[1];

const waitArgs = {
  check,
  verdict: 'adjust' as const,
  currency: 'USD',
  monthlyAmount: 25000,
  readyBy: '2027-03-01',
  today: '2026-10-16',
  goalTarget: 100000 as number | null,
  coolingOff: false,
};

beforeEach(() => {
  mockUuid = 0;
  mockTrack.mockClear();
  mockWait.mockReset();
  mockCooling.mockReset();
  mockWait.mockResolvedValue({ scheduled: true, id: 'n1' });
  mockCooling.mockResolvedValue({ scheduled: true, id: 'n2' });
  (recordFailedWrite as jest.Mock).mockClear();
  resetToastForTests();
  onlineManager.setOnline(true);
});

describe('useWaitAndSave', () => {
  it('queues the wait outcome with a goal, marks the check waiting and sets the reminder', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });

    const outcome = await result.current.save(waitArgs);
    expect(outcome).toEqual({ reminder: 'set', stepId: expect.any(String) });
    expect(mockWait).toHaveBeenCalledWith('chk1', '2027-03-01', '2026-10-16');
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));

    const payload = rpcArgs(fake);
    expect(payload.p_outcome).toBe('wait');
    expect(payload.p_decision).toEqual({
      verdict: 'adjust',
      wait_monthly: 25000,
      ready_by: '2027-03-01',
      cooling_off: false,
      goal: { id: 'id-1', name: 'Sofa', currency: 'USD', target: 100000, account_id: null },
    });
    expect(mockTrack).toHaveBeenCalledWith('decision_recorded', { decision: 'wait' });
    await waitFor(() => expect(qc.getQueryData<DecideCheckRow[]>(CHECKS)?.[0]?.status).toBe('waiting'));
    expect(qc.getQueryData<SavingsGoalRow[]>(GOALS)).toBeDefined();
  });

  it('creates no goal when there is nothing left to save', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    await result.current.save({ ...waitArgs, goalTarget: 0 });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect((rpcArgs(fake).p_decision as { goal: unknown }).goal).toBeNull();
    const nullTarget = await result.current.save({ ...waitArgs, goalTarget: null });
    expect(nullTarget).toEqual({ reminder: 'set', stepId: expect.any(String) });
  });

  it('a refused permission still saves the decision and reports off', async () => {
    const fake = setup();
    fake.respondWith(applied());
    mockWait.mockResolvedValue({ scheduled: false });
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    const outcome = await result.current.save(waitArgs);
    expect(outcome).toEqual({ reminder: 'off', stepId: expect.any(String) });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('a scheduler that throws still saves the decision', async () => {
    const fake = setup();
    fake.respondWith(applied());
    mockWait.mockRejectedValue(new Error('boom'));
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    expect(await result.current.save(waitArgs)).toEqual({ reminder: 'off', stepId: expect.any(String) });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('with no ready-by date sets no reminder', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    expect(await result.current.save({ ...waitArgs, readyBy: null })).toEqual({ reminder: 'none', stepId: expect.any(String) });
    expect(mockWait).not.toHaveBeenCalled();
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('sets the cooling-off reminder when asked', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    await result.current.save({ ...waitArgs, coolingOff: true });
    await waitFor(() => expect(mockCooling).toHaveBeenCalledTimes(1));
    expect(mockCooling.mock.calls[0]![0]).toBe('chk1');
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect((rpcArgs(fake).p_decision as { cooling_off: boolean }).cooling_off).toBe(true);
  });

  it('a refused write is parked with the outcome only', async () => {
    const fake = setup();
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    await result.current.save(waitArgs);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'decide_checks', entityId: 'chk1', attempted: { outcome: 'wait' } })
    );
  });

  it('a failed Wait and save write shows the failed-save toast', async () => {
    const fake = setup();
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    await result.current.save(waitArgs);
    await waitFor(() => expect(getToast()).not.toBeNull());
    expect(getToast()?.kind).toBe('refusal');
    expect(getToast()?.text).toEqual({ key: 'decide.toast.outcomeFailed' });
  });

  it('a write queued offline shows no toast', async () => {
    const fake = setup();
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    onlineManager.setOnline(false);
    try {
      const qc = newClient();
      const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
      await result.current.save(waitArgs);
      await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
      expect(fake.calls.some((c) => c.method === 'rpc')).toBe(false);
      expect(getToast()).toBeNull();
      expect(recordFailedWrite).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('already-applied is success', async () => {
    const fake = setup();
    fake.respondWith(ok({ status: 'already-applied' }));
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    await result.current.save(waitArgs);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});

describe('usePass', () => {
  it('a failed Pass write shows the failed-save toast', async () => {
    const fake = setup();
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(getToast()).not.toBeNull());
    expect(getToast()?.text).toEqual({ key: 'decide.toast.outcomeFailed' });
  });

  it('queues the pass outcome, marks the check passed and sets no reminder', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcArgs(fake).p_outcome).toBe('pass');
    expect(rpcArgs(fake).p_decision).toEqual({ verdict: 'no', cooling_off: false });
    expect(mockTrack).toHaveBeenCalledWith('decision_recorded', { decision: 'pass' });
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockCooling).not.toHaveBeenCalled();
    await waitFor(() => expect(qc.getQueryData<DecideCheckRow[]>(CHECKS)?.[0]?.status).toBe('passed'));
  });

  it('sets the cooling-off reminder for a pass when asked', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check, verdict: 'adjust', coolingOff: true });
    await waitFor(() => expect(mockCooling).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });
});

describe('D-21 undo steps (05.3-68: recorded by the server)', () => {
  const undoInserts = (fake: FakeSupabase) => fake.calls.filter((c) => c.table === 'undo_log');
  const noClientStep = (fake: FakeSupabase) => {
    expect(undoInserts(fake)).toHaveLength(0);
    expect(fake.calls.filter((c) => c.method === 'from' || c.table === 'decide_checks')).toHaveLength(0);
  };

  it('Plan it sends p_undo_step in the one RPC and writes nothing to undo_log', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useWaitAndSave(), { wrapper: wrapper(qc) });
    const out = await result.current.save({ ...waitArgs, accountId: 'acc-1' });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcArgs(fake).p_undo_step).toEqual({ id: out.stepId, label_key: 'planSaved', label_params: { name: 'Sofa' } });
    expect((rpcArgs(fake).p_decision as { goal: { account_id: string } }).goal.account_id).toBe('acc-1');
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(GOALS)?.[0]?.account_id).toBe('acc-1'));
    noClientStep(fake);
  });

  it('Not buying sends p_undo_step', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    const stepId = result.current.pass({ check, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcArgs(fake).p_undo_step).toEqual({ id: stepId, label_key: 'notBuyingSaved', label_params: { name: 'Sofa' } });
    noClientStep(fake);
  });

  it('sends empty label_params when the name is empty', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check: { ...check, name: '', inputs: {} }, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect((rpcArgs(fake).p_undo_step as { label_params: unknown }).label_params).toEqual({});
  });

  it('a persisted write without undo still makes the 3-key call', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    await qc
      .getMutationCache()
      .build(qc, { mutationKey: mutationKeys.decideOutcome })
      .execute({
        checkId: 'chk1',
        ownerId: 'u1',
        householdId: 'h1',
        decision: { outcome: 'pass', verdict: 'no', cooling_off: false },
      });
    expect(Object.keys(rpcArgs(fake)).sort()).toEqual(['p_check_id', 'p_decision', 'p_outcome']);
  });

  it('invalidates the undo log on success', async () => {
    setup().respondWith(applied());
    const qc = newClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog('u1') }));
  });

  it('a double tap writes once and hands back the same step', async () => {
    const fake = setup();
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    const a = result.current.pass({ check, verdict: 'no', coolingOff: false });
    const b = result.current.pass({ check, verdict: 'no', coolingOff: false });
    expect(b).toBe(a);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1);
  });

  it('a failed write toasts and sends no client step', async () => {
    const fake = setup();
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    const { result } = await renderHook(() => usePass(), { wrapper: wrapper(qc) });
    result.current.pass({ check, verdict: 'no', coolingOff: false });
    await waitFor(() => expect(getToast()).not.toBeNull());
    noClientStep(fake);
  });
});
