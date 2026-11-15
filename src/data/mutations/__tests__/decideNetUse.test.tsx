// 06.1-12 (D-20): unlock / lock the safety net for Decide's answers through set_net_answer_use.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { registerDecideNetUseMutations, useSetNetAnswerUse } from '../decideNetUse';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'step-1') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: () => 'UTC' }));
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const KEY = queryKeys.savingsGoals('u1', 'hh1');
const ok = (data: unknown) => ({ data, error: null, status: 200 });
const net = (over: Partial<SavingsGoalRow> = {}): SavingsGoalRow =>
  ({
    id: 'net1',
    household_id: 'hh1',
    created_by: 'u1',
    name: 'Safety net',
    currency: 'USD',
    target: 230000,
    is_safety_net: true,
    locked: true,
    protect: true,
    deleted_at: null,
    version: 4,
    decide_may_use: false,
    kind: 'pot',
    ...over,
  }) as SavingsGoalRow;
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideNetUseMutations(qc);
  qc.setQueryData(KEY, [net()]);
  return { fake, qc };
}
const rpc = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, any>];

beforeEach(() => {
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('useSetNetAnswerUse', () => {
  it('unlock calls set_net_answer_use with safetyNetUnlocked and shows a toast with Undo', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', goal_id: 'net1', goal_version: 5, undo_step_id: 'step-1' }));
    const { result } = await renderHook(() => useSetNetAnswerUse(), { wrapper: wrapper(qc) });
    const stepId = result.current.mutate({ goal: net(), on: true, ownerId: 'u1' });
    expect(stepId).toBe('step-1');
    expect(getToast()?.stepId).toBe('step-1');
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [name, args] = rpc(fake);
    expect(name).toBe('set_net_answer_use');
    expect(args).toMatchObject({ p_goal_id: 'net1', p_on: true, p_expected_version: 4 });
    expect(args.p_undo_step).toEqual({ id: 'step-1', label_key: 'safetyNetUnlocked', label_params: { name: 'Safety net' } });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('lock shows a plain toast with no Undo and writes safetyNetLocked; unchanged counts as success', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [net({ decide_may_use: true })]);
    fake.respondWith(ok({ status: 'unchanged', goal_id: 'net1' }));
    const { result } = await renderHook(() => useSetNetAnswerUse(), { wrapper: wrapper(qc) });
    result.current.mutate({ goal: net({ decide_may_use: true }), on: false, ownerId: 'u1' });
    expect(getToast()?.stepId).toBeNull();
    expect(getToast()?.text?.key).toBe('decide.screens.safetyNet.settings.lockedToast');
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(rpc(fake)[1]!.p_undo_step.label_key).toBe('safetyNetLocked');
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('already in the asked state sends nothing; a goal that is not the net is refused', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSetNetAnswerUse(), { wrapper: wrapper(qc) });
    expect(result.current.mutate({ goal: net(), on: false, ownerId: 'u1' })).toBeNull();
    expect(() => result.current.mutate({ goal: net({ is_safety_net: false }), on: true, ownerId: 'u1' })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a conflict puts the flag back and parks the write with the column name only', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'conflict' }));
    const { result } = await renderHook(() => useSetNetAnswerUse(), { wrapper: wrapper(qc) });
    result.current.mutate({ goal: net(), on: true, ownerId: 'u1' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<SavingsGoalRow[]>(KEY)?.[0]?.decide_may_use).toBe(false);
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'savings_goals',
      entityId: 'net1',
      kind: 'conflict',
      attempted: { fields: ['decide_may_use'] },
    });
  });
});
