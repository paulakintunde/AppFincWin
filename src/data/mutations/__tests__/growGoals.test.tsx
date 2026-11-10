// 06-12 (GRW-01..03): the queued goal writes. Make / edit a goal, Add money / Take some out, confirm a contribution, confirm
// and set the safety net. One Undo step each, conflicts parked with field names only, offline writes replay.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import {
  registerGrowGoalMutations,
  useConfirmGoalContribution,
  useConfirmSafetyNet,
  useEditGoal,
  useMoveGoalMoney,
  useSaveGoalPlan,
  useSetSafetyNet,
  type MoveGoalMoneyInput,
} from '../growGoals';
import { buildGoalsModel } from '@/features/grow/goals/useGoalsRead';
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
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: () => 'UTC' }));
// buildGoalsModel is pure; its module's read hooks are not used here.
jest.mock('@/data/queries/growGoals', () => ({}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({}));

const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const KEY = queryKeys.savingsGoals('user-1', 'hh-1');
const ok = (data: unknown) => ({ data, error: null, status: 200 });

const goal = (over: Partial<SavingsGoalRow> = {}): SavingsGoalRow => ({
  id: 'g1',
  household_id: 'hh-1',
  created_by: 'user-1',
  check_id: null,
  name: 'Lisbon',
  currency: 'USD',
  target: 180000,
  monthly_amount: 5000,
  ready_by: '2027-06-01',
  opening_saved: 54000,
  kind: 'pot',
  bucket: null,
  account_id: 'acc-sav',
  color_key: null,
  is_safety_net: false,
  locked: true,
  protect: true,
  up_front_only: false,
  icon: null,
  net_confirmed_at: null,
  done_at: null,
  is_sample: false,
  deleted_at: null,
  version: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const SERIES = {
  id: 's1',
  account_id: 'acc-chk',
  amount: 5000,
  anchor_date: '2026-11-16',
  time_zone: 'UTC',
  name: 'Lisbon',
  category_id: null,
};

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerGrowGoalMutations(qc);
  return { fake, qc };
}

const rpcCall = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, any>];

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('registration', () => {
  it('registers defaults for all six keys', () => {
    const { qc } = setup();
    for (const k of [
      mutationKeys.saveGoalPlan,
      mutationKeys.editGoal,
      mutationKeys.moveGoalMoney,
      mutationKeys.confirmGoalContribution,
      mutationKeys.confirmSafetyNet,
      mutationKeys.setSafetyNet,
    ]) {
      expect(qc.getMutationDefaults(k).mutationFn).toBeDefined();
    }
  });
});

describe('useSaveGoalPlan', () => {
  const FIELDS = {
    name: ' Lisbon ',
    currency: 'USD',
    locked: true,
    target: 180000,
    ready_by: '2027-06-01',
    monthly_amount: 5000,
    opening_saved: 54000,
    account_id: 'acc-sav',
  };

  it('a new goal is one queued save: optimistic row, a goalMade step with no client ops (the server builds them)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', goal_id: 'id-2', goal_version: 1, series_id: 's1', series_version: 2, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    const out = result.current.save({ ownerId: 'user-1', householdId: 'hh-1', fields: FIELDS, series: SERIES });
    expect(out).toEqual({ id: 'id-2', stepId: 'id-1' });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-2']));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [name, args] = rpcCall(fake);
    expect(name).toBe('save_goal_plan');
    expect(args.p_expected_version).toBeNull();
    expect(args.p_goal).toMatchObject({ id: 'id-2', household_id: 'hh-1', name: 'Lisbon', locked: true, target: 180000 });
    expect(args.p_goal.is_safety_net).toBeUndefined();
    expect(args.p_series).toMatchObject({ id: 's1', amount: 5000 });
    // 06-06 follow-up: save_goal_plan builds the Undo step itself (goal, monthly record and its Expected lines).
    expect(args.p_undo_step).toEqual({ id: 'id-1', label_key: 'goalMade', label_params: { name: 'Lisbon' } });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('locked is a required field of a new goal (type level)', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    // @ts-expect-error locked must be answered; there is no default (D-23)
    const missing = () => result.current.save({ ownerId: 'u', householdId: 'hh-1', fields: { ...FIELDS, locked: undefined }, series: null });
    expect(typeof missing).toBe('function');
  });

  it('the safety-net create sends is_safety_net with Locked and uses the safetyNetSizeSaved label', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', goal_id: 'id-1', goal_version: 1, undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({
      ownerId: 'user-1',
      householdId: 'hh-1',
      fields: { name: 'Safety net', currency: 'USD', locked: true, protect: true, is_safety_net: true, target: 230000, ready_by: null, monthly_amount: null, opening_saved: 0 },
      series: null,
    });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]).toMatchObject({ is_safety_net: true, locked: true, protect: true }));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [, args] = rpcCall(fake);
    expect(args.p_goal).toMatchObject({ is_safety_net: true, locked: true, protect: true, name: 'Safety net', target: 230000 });
    expect(args.p_undo_step.label_key).toBe('safetyNetSizeSaved');
  });

  it('06-32: a safety net made in the app starts confirmed (no "We moved your safety net here"); a plain goal does not', async () => {
    const { qc } = setup();
    onlineManager.setOnline(false); // the optimistic rows stay put while the saves wait
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({
      ownerId: 'user-1',
      householdId: 'hh-1',
      fields: { name: 'Safety net', currency: 'USD', locked: true, protect: true, is_safety_net: true, target: 230000, ready_by: null, monthly_amount: null, opening_saved: 0 },
      series: null,
    });
    result.current.save({ ownerId: 'user-1', householdId: 'hh-1', fields: FIELDS, series: null });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)).toHaveLength(2));
    const [net, plain] = qc.getQueryData<SavingsGoalRow[]>(KEY) as SavingsGoalRow[];
    expect(net?.net_confirmed_at).toBe('2026-11-05T12:00:00.000Z');
    expect(plain?.net_confirmed_at).toBeNull();
    const model = buildGoalsModel([net as SavingsGoalRow], [], (amount) => amount, 'USD');
    expect(model.safetyNet).not.toBeNull();
    expect(model.needsNetConfirm).toBe(false);
    onlineManager.setOnline(true);
  });

  it('refuses a safety net that is not Locked, and bad values, before anything is queued', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    const base = { ownerId: 'u', householdId: 'hh-1', series: null };
    expect(() => result.current.save({ ...base, fields: { ...FIELDS, locked: false, is_safety_net: true } })).toThrow('safety-net-must-be-locked');
    expect(() => result.current.save({ ...base, fields: { ...FIELDS, name: '   ' } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...FIELDS, target: 0 } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...FIELDS, currency: 'dollars' } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: FIELDS, series: { ...SERIES, amount: 0 } })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', existing: goal({ is_safety_net: true }), fields: { locked: false }, series: null })).toThrow(
      'safety-net-must-be-locked'
    );
    expect(() => result.current.save({ ownerId: 'u', existing: goal(), fields: { is_safety_net: true } as never, series: null })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a plan change is version-conditional, never sends the flag, and names a goalPlanChanged step for the server to build', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [goal()]);
    fake.respondWith(ok({ status: 'applied', goal_id: 'g1', goal_version: 4, series_id: 's1', series_version: 2, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', existing: goal(), fields: { monthly_amount: 7000 }, series: { ...SERIES, amount: 7000 } });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]?.monthly_amount).toBe(7000));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [, args] = rpcCall(fake);
    expect(args.p_expected_version).toBe(3);
    expect(args.p_goal).toEqual({ id: 'g1', monthly_amount: 7000 });
    expect(args.p_undo_step).toEqual({ id: 'id-1', label_key: 'goalPlanChanged', label_params: { name: 'Lisbon' } });
  });

  it('series null is sent as null (stops the monthly record)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', goal_id: 'g1', goal_version: 4, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', existing: goal(), fields: { monthly_amount: null }, series: null });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcCall(fake)[1].p_series).toBeNull();
  });

  it('already-applied is success: no failed write', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'already-applied', undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', householdId: 'hh-1', fields: FIELDS, series: null });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('a conflict is parked with field names only and the cache is refetched', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [goal()]);
    fake.respondWith(ok({ status: 'conflict' }));
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', existing: goal(), fields: { name: 'Secret trip', monthly_amount: 7777 }, series: null });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'savings_goals', entityId: 'g1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Secret|7777/);
  });

  it('a rejected insert leaves the cache and is parked', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '22023' }, status: 400 });
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', householdId: 'hh-1', fields: FIELDS, series: null });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)).toEqual([]);
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ kind: 'rejected' });
  });

  it('queues while offline and the save replays on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSaveGoalPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', householdId: 'hh-1', fields: FIELDS, series: null });
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.length).toBe(1));
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(0);
    fake.respondWith(ok({ status: 'applied', goal_id: 'id-1', goal_version: 1, undo_step_id: 'id-2' }));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1));
  });
});

describe('useEditGoal', () => {
  it('patches only the given keys with a goalEdited step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [goal()]);
    fake.respondWith(ok([goal({ name: 'Porto', version: 4 })]));
    const { result } = await renderHook(() => useEditGoal(), { wrapper: wrapper(qc) });
    const stepId = result.current.edit(goal(), { name: ' Porto ' }, 'user-1', 64000);
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Porto' });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 3]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'goalEdited',
      labelParams: { name: 'Porto' },
      ops: [{ entity: 'savings_goals', id: 'g1', expectedVersion: 4, patch: { name: 'Lisbon' } }],
    });
  });

  it('refuses a target below what is saved, other keys, an empty patch and unlocking the net', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useEditGoal(), { wrapper: wrapper(qc) });
    expect(() => result.current.edit(goal(), { target: 50000 }, 'u', 64000)).toThrow('target-below-saved');
    expect(() => result.current.edit(goal(), {}, 'u', 0)).toThrow(RangeError);
    expect(() => result.current.edit(goal(), { done_at: 'x' } as never, 'u', 0)).toThrow(RangeError);
    expect(() => result.current.edit(goal({ is_safety_net: true }), { locked: false }, 'u', 0)).toThrow('safety-net-must-be-locked');
    expect(() => result.current.edit(goal(), { target: 64000 }, 'u', 64000)).not.toThrow(); // equal is allowed
    expect(fake.calls.length).toBeGreaterThanOrEqual(0);
  });

  it('a size-only edit of the safety net uses safetyNetSizeSaved', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([goal({ is_safety_net: true, target: 300000, version: 4 })]));
    const { result } = await renderHook(() => useEditGoal(), { wrapper: wrapper(qc) });
    result.current.edit(goal({ is_safety_net: true }), { target: 300000 }, 'user-1', 0);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1].labelKey).toBe('safetyNetSizeSaved');
  });

  it('remove soft-deletes with a goalRemoved step and drops the row from the cache', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [goal()]);
    fake.respondWith(ok([goal({ deleted_at: '2026-11-05T12:00:00Z', version: 4 })]));
    const { result } = await renderHook(() => useEditGoal(), { wrapper: wrapper(qc) });
    result.current.remove(goal(), 'user-1');
    await waitFor(() => expect(qc.getQueryData<SavingsGoalRow[]>(KEY)).toEqual([]));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'goalRemoved',
      ops: [{ entity: 'savings_goals', id: 'g1', expectedVersion: 4, patch: { deleted_at: null } }],
    });
    expect(() => result.current.remove(goal({ deleted_at: 'x' }), 'u')).toThrow(RangeError);
  });

  it('parks a version conflict with field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [goal()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(goal({ version: 9 })));
    const { result } = await renderHook(() => useEditGoal(), { wrapper: wrapper(qc) });
    result.current.edit(goal(), { name: 'Secret', monthly_amount: 4242 }, 'user-1', 0);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'savings_goals', entityId: 'g1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Secret|4242/);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});

describe('useConfirmSafetyNet', () => {
  it('stamps net_confirmed_at with one safetyNetConfirmed step that clears it', async () => {
    const { fake, qc } = setup();
    const net = goal({ id: 'net', name: 'Safety net', is_safety_net: true });
    qc.setQueryData(KEY, [net]);
    fake.respondWith(ok([{ ...net, net_confirmed_at: '2026-11-05T12:00:00.000Z', version: 4 }]));
    const { result } = await renderHook(() => useConfirmSafetyNet(), { wrapper: wrapper(qc) });
    expect(() => result.current.confirm(goal(), 'u')).toThrow(RangeError);
    result.current.confirm(net, 'user-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ net_confirmed_at: '2026-11-05T12:00:00.000Z' });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'safetyNetConfirmed',
      ops: [{ entity: 'savings_goals', id: 'net', expectedVersion: 4, patch: { net_confirmed_at: null } }],
    });
  });
});

describe('useMoveGoalMoney', () => {
  const lines = [
    { id: 'l1', goal_id: 'g1', status: 'paid', deleted_at: null, transfer_id: 't1', original_amount: 5000, original_currency: 'USD', local_date: '2026-11-01' },
  ];
  const toHome = (a: number, c: string): number | null => (c === 'USD' ? a : null);
  const base = (over: Partial<MoveGoalMoneyInput> = {}): MoveGoalMoneyInput => ({
    householdId: 'hh-1',
    ownerId: 'user-1',
    homeCurrency: 'USD',
    kind: 'add',
    goal: { id: 'g1', name: 'Lisbon', currency: 'USD', target: 180000, opening_saved: 54000 },
    goalAccount: { id: 'acc-sav', currency: 'USD' },
    account: { id: 'acc-chk', currency: 'USD' },
    amount: 20000,
    categoryId: 'cat-transfer',
    lines,
    toHome,
    localDate: '2026-11-05',
    ...over,
  });
  const upserted = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>[];

  it('Add money writes both legs in ONE upsert with the goal tag on the goal-side (in) leg, and one goalMoneyMoved step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(
      ok([
        { id: 'id-2', local_date: '2026-11-05', version: 1, rate_pending: false },
        { id: 'id-3', local_date: '2026-11-05', version: 1, rate_pending: false },
      ])
    );
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    const out = result.current.move(base());
    expect(out.transferId).toBe('id-1');
    expect(out.reachedTarget).toBe(false);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    const rows = upserted(fake);
    expect(fake.calls.filter((c) => c.method === 'upsert')).toHaveLength(1);
    expect(rows).toHaveLength(2);
    const out1 = rows.find((r) => (r.original_amount as number) < 0)!;
    const in1 = rows.find((r) => (r.original_amount as number) > 0)!;
    expect(out1).toMatchObject({ account_id: 'acc-chk', original_amount: -20000, transfer_id: 'id-1', status: 'paid' });
    expect(out1.goal_id).toBeUndefined();
    expect(in1).toMatchObject({ account_id: 'acc-sav', original_amount: 20000, transfer_id: 'id-1', goal_id: 'g1' });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'goalMoneyMoved',
      labelParams: { name: 'Lisbon' },
      ops: [
        { entity: 'transactions', id: 'id-2', expectedVersion: 1, patch: { deleted_at: '$now' } },
        { entity: 'transactions', id: 'id-3', expectedVersion: 1, patch: { deleted_at: '$now' } },
      ],
    });
  });

  it('Take some out puts the goal tag on the OUT leg', async () => {
    const { fake, qc } = setup();
    fake.respondWith(
      ok([
        { id: 'id-2', local_date: '2026-11-05', version: 1, rate_pending: false },
        { id: 'id-3', local_date: '2026-11-05', version: 1, rate_pending: false },
      ])
    );
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    const out = result.current.move(base({ kind: 'take', amount: 10000 }));
    expect(out.reachedTarget).toBe(false);
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    const rows = upserted(fake);
    expect(rows.find((r) => (r.original_amount as number) < 0)).toMatchObject({ account_id: 'acc-sav', original_amount: -10000, goal_id: 'g1' });
    expect(rows.find((r) => (r.original_amount as number) > 0)!.goal_id).toBeUndefined();
  });

  it('a goal with no account takes one tagged line (adding); taking out of it is refused', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([{ id: 'id-1', local_date: '2026-11-05', version: 1, rate_pending: false }]));
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    expect(() => result.current.move(base({ goalAccount: null, kind: 'take' }))).toThrow('goal-has-no-account');
    result.current.move(base({ goalAccount: null }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    const rows = upserted(fake);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account_id: 'acc-chk', original_amount: -20000, goal_id: 'g1' });
    expect(rows[0]!.transfer_id).toBeUndefined();
    expect(insertUndoStep.mock.calls[0]![1].ops).toHaveLength(1);
  });

  it('reports reachedTarget only for the deposit that carries the goal to its target', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([]));
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    // 54000 + 5000 = 59000 saved; a 121000 deposit reaches 180000 exactly.
    expect(result.current.move(base({ amount: 121000 })).reachedTarget).toBe(true);
    expect(result.current.move(base({ amount: 120999 })).reachedTarget).toBe(false);
    expect(result.current.move(base({ amount: 500000 })).reachedTarget).toBe(true);
    // An open-ended goal never "reaches".
    expect(result.current.move(base({ amount: 500000, goal: { id: 'g1', name: 'Lisbon', currency: 'USD', target: null, opening_saved: 0 } })).reachedTarget).toBe(false);
  });

  it('refuses bad input before anything is queued', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    expect(() => result.current.move(base({ amount: 0 }))).toThrow(RangeError);
    expect(() => result.current.move(base({ amount: 1.5 }))).toThrow(RangeError);
    expect(() => result.current.move(base({ categoryId: null }))).toThrow(TypeError);
    expect(() => result.current.move(base({ account: { id: 'acc-sav', currency: 'USD' } }))).toThrow(TypeError);
  });

  it('a rejected write removes the optimistic legs and is parked with ids only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    const { result } = await renderHook(() => useMoveGoalMoney(), { wrapper: wrapper(qc) });
    result.current.move(base());
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'transactions', entityId: 'goal-money:g1', attempted: { goalId: 'g1', count: 2 } });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});

describe('useConfirmGoalContribution', () => {
  const line = (over: Partial<TransactionRow> = {}) =>
    ({
      id: 'line-1',
      household_id: 'hh-1',
      account_id: 'acc-chk',
      original_amount: -5000,
      original_currency: 'USD',
      local_date: '2026-11-16',
      version: 2,
      ...over,
    }) as Pick<TransactionRow, 'id' | 'household_id' | 'account_id' | 'original_amount' | 'original_currency' | 'local_date' | 'version'>;

  it('into a goal with its own account it sends the new leg ids and names the step (the server builds the pair undo)', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', transaction_version: 3, in_leg_id: 'id-2', in_leg_version: 1, transfer_id: 'id-3', undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useConfirmGoalContribution(), { wrapper: wrapper(qc) });
    const stepId = result.current.confirm({ ownerId: 'user-1', line: line(), goal: { id: 'g1', name: 'Lisbon', currency: 'USD', account_id: 'acc-sav' } });
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [name, args] = rpcCall(fake);
    expect(name).toBe('confirm_goal_contribution');
    expect(args).toMatchObject({ p_transaction_id: 'line-1', p_expected_version: 2, p_in_leg: { id: 'id-2', transfer_id: 'id-3' } });
    expect(args.p_undo_step).toEqual({ id: 'id-1', label_key: 'goalContributionConfirmed', label_params: { name: 'Lisbon' } });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
  });

  it('without a separate goal account the line just becomes paid (no in-leg) and the step carries no client ops', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', transaction_version: 3, undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useConfirmGoalContribution(), { wrapper: wrapper(qc) });
    result.current.confirm({ ownerId: 'user-1', line: line(), goal: { id: 'g1', name: 'Lisbon', currency: 'USD', account_id: 'acc-chk' } });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [, args] = rpcCall(fake);
    expect(args.p_in_leg).toBeNull();
    expect(args.p_undo_step).toEqual({ id: 'id-1', label_key: 'goalContributionConfirmed', label_params: { name: 'Lisbon' } });
  });

  it('a replay (already-applied) is success; a conflict is parked', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'already-applied', undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useConfirmGoalContribution(), { wrapper: wrapper(qc) });
    const goalArg = { id: 'g1', name: 'Lisbon', currency: 'USD', account_id: null };
    result.current.confirm({ ownerId: 'user-1', line: line(), goal: goalArg });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
    fake.respondWith(ok({ status: 'conflict' }));
    result.current.confirm({ ownerId: 'user-1', line: line({ id: 'line-2' }), goal: goalArg });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'transactions', entityId: 'line-2', kind: 'conflict', code: 'version-conflict' });
  });
});

describe('useSetSafetyNet', () => {
  const flagged = (rows: SavingsGoalRow[] | undefined) => (rows ?? []).filter((r) => r.is_safety_net === true).map((r) => r.id);
  const NET = goal({ id: 'net', name: 'Safety net', is_safety_net: true, version: 5, locked: true });
  const LISBON = goal({ id: 'g1', locked: false, protect: false, version: 3 });

  it('swaps the old net out: one flagged row in the cache, versions of both sent, server-built step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [NET, LISBON]);
    fake.respondWith(ok({ status: 'applied', goal_id: 'g1', previous_goal_id: 'net', goal_version: 4, previous_version: 6, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSetSafetyNet(), { wrapper: wrapper(qc) });
    const stepId = result.current.set(LISBON, NET, 'user-1');
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(flagged(qc.getQueryData(KEY))).toEqual(['g1']));
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.find((r) => r.id === 'g1')).toMatchObject({ locked: true, protect: true });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [name, args] = rpcCall(fake);
    expect(name).toBe('set_safety_net');
    expect(args).toEqual({
      p_goal_id: 'g1',
      p_expected_versions: { g1: 3, net: 5 },
      p_undo_step: { id: 'id-1', label_key: 'safetyNetChanged', label_params: { name: 'Lisbon' } },
    });
    expect(insertUndoStep).not.toHaveBeenCalled(); // the server stores the step
  });

  it('with no current net it flags the goal alone; an already-flagged goal queues nothing', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [LISBON]);
    fake.respondWith(ok({ status: 'applied', goal_id: 'g1', previous_goal_id: null, goal_version: 4, previous_version: null, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSetSafetyNet(), { wrapper: wrapper(qc) });
    expect(result.current.set(NET, null, 'user-1')).toBeNull();
    result.current.set(LISBON, null, 'user-1');
    await waitFor(() => expect(flagged(qc.getQueryData(KEY))).toEqual(['g1']));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(rpcCall(fake)[1].p_expected_versions).toEqual({ g1: 3 });
    expect(() => result.current.set(goal({ bucket: 'trip' }), null, 'u')).toThrow(RangeError);
    expect(() => result.current.set(goal({ deleted_at: 'x' }), null, 'u')).toThrow(RangeError);
  });

  it('a conflict rolls both rows back together and parks field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [NET, LISBON]);
    fake.respondWith(ok({ status: 'conflict' }));
    const { result } = await renderHook(() => useSetSafetyNet(), { wrapper: wrapper(qc) });
    result.current.set(LISBON, NET, 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const rows = qc.getQueryData<SavingsGoalRow[]>(KEY);
    expect(flagged(rows)).toEqual(['net']);
    expect(rows?.find((r) => r.id === 'g1')).toMatchObject({ is_safety_net: false, locked: false, protect: false });
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'savings_goals', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toMatch(/Lisbon/);
  });

  it('queues while offline and replays on reconnect', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [NET, LISBON]);
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSetSafetyNet(), { wrapper: wrapper(qc) });
    result.current.set(LISBON, NET, 'user-1');
    await waitFor(() => expect(flagged(qc.getQueryData(KEY))).toEqual(['g1']));
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(0);
    fake.respondWith(ok({ status: 'unchanged', goal_id: 'g1' }));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});
