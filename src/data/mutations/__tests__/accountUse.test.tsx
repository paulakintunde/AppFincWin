// 05.2-14: account use, mixed placement and emergency fund as atomic batches with one Undo.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { SessionWipedError } from '@/data/sync/sessionEpoch';
import { clearVersionChains } from '@/data/sync/versionChain';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { minorUnits } from '@/engine/money';
import { registerMutationDefaults } from '../index';
import { useSaveAccountUse, useSaveAccountUses, useSaveEmergencyFund } from '../accountUse';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `step-${++mockUuid}`),
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const USER = 'user-1';
const HH = 'h1';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return { fake, qc };
}

const account = (id: string, overrides: Partial<AccountRow> = {}): AccountRow => ({
  id,
  household_id: HH,
  created_by: USER,
  name: id,
  kind: 'checking',
  currency: 'GBP',
  opening_balance: 0,
  archived_at: null,
  updated_by: null,
  overdraft_limit: null,
  credit_limit: null,
  use: null,
  use_purpose: null,
  use_envelope_id: null,
  use_extra_set_aside: null,
  deleted_at: null,
  is_sample: false,
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const goal = (id: string, overrides: Partial<SavingsGoalRow> = {}): SavingsGoalRow => ({
  id,
  household_id: HH,
  created_by: USER,
  check_id: null,
  name: id,
  currency: 'GBP',
  target: null,
  monthly_amount: null,
  ready_by: null,
  opening_saved: 0,
  kind: 'pot',
  account_id: null,
  done_at: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const settings = (overrides: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({
  ...EMPTY_DECIDE_SETTINGS,
  id: 'set-1',
  user_id: USER,
  version: 3,
  currency: 'GBP',
  ...overrides,
});

const applied = (...rows: [string, string, number][]) => ({
  data: { status: 'applied', rows: rows.map(([entity, id, version]) => ({ entity, id, version })) },
  error: null,
  status: 200,
});

type Op = { entity: string; id: string; expectedVersion: number; patch: Record<string, unknown> };
function rpcArgs(fake: FakeSupabase): { p_ops: Op[]; p_undo_step: { id: string; label_key: string; ops: Op[] } } {
  const call = fake.calls.find((c) => c.method === 'rpc');
  return (call?.args[1] as never) ?? ({} as never);
}
const rpcCount = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').length;

beforeEach(() => {
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});

describe('registration', () => {
  it('registers a default mutationFn for each of the three keys', () => {
    const { qc } = setup();
    expect(qc.getMutationDefaults(mutationKeys.saveAccountUses).mutationFn).toBeDefined();
    expect(qc.getMutationDefaults(mutationKeys.saveAccountUse).mutationFn).toBeDefined();
    expect(qc.getMutationDefaults(mutationKeys.saveEmergencyFund).mutationFn).toBeDefined();
  });
});

describe('useSaveAccountUses', () => {
  it('writes one op per changed account in one batch with one labelled undo step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['accounts', 'a', 2], ['accounts', 'b', 5]));
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    const a = account('a');
    const b = account('b', { version: 4, use: 'mixed', use_extra_set_aside: 700 });
    const c = account('c', { use: 'everyday' });
    const out = result.current.save([
      { account: a, use: { kind: 'everyday' } },
      { account: b, use: { kind: 'dedicated', purpose: { kind: 'emergency' } } },
      { account: c, use: { kind: 'everyday' } },
      { account: a, use: { kind: 'untouched' } },
    ]);
    expect(out).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    const args = rpcArgs(fake);
    expect(args.p_ops).toEqual([
      { entity: 'accounts', id: 'a', expectedVersion: 1, patch: { use: 'everyday', use_purpose: null, use_envelope_id: null, use_extra_set_aside: null } },
      { entity: 'accounts', id: 'b', expectedVersion: 4, patch: { use: 'dedicated', use_purpose: 'emergency', use_envelope_id: null, use_extra_set_aside: null } },
    ]);
    expect(args.p_undo_step).toMatchObject({ id: 'step-1', label_key: 'accountUseSaved' });
    expect(args.p_undo_step.ops).toEqual([
      { entity: 'accounts', id: 'a', expectedVersion: 2, patch: { use: null, use_purpose: null, use_envelope_id: null, use_extra_set_aside: null } },
      { entity: 'accounts', id: 'b', expectedVersion: 5, patch: { use: 'mixed', use_purpose: null, use_envelope_id: null, use_extra_set_aside: 700 } },
    ]);
  });

  it('leaves unchanged accounts out and writes nothing when none changed', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    expect(result.current.save([{ account: account('c', { use: 'everyday' }), use: { kind: 'everyday' } }])).toBeNull();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(rpcCount(fake)).toBe(0);
  });

  it('updates the account cache at once and refetches on success', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['accounts', 'a', 2]));
    qc.setQueryData(queryKeys.accounts(HH), [account('a'), account('z')]);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    result.current.save([{ account: account('a'), use: { kind: 'untouched' } }]);
    await waitFor(() => {
      const rows = qc.getQueryData<AccountRow[]>(queryKeys.accounts(HH));
      expect(rows?.find((r) => r.id === 'a')?.use).toBe('untouched');
    });
    expect(qc.getQueryData<AccountRow[]>(queryKeys.accounts(HH))?.find((r) => r.id === 'z')?.use).toBeNull();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accounts(HH) }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.undoLog(USER) });
  });

  it('refuses the whole batch on a version conflict: refusal toast, one failed write, ids only', async () => {
    const { fake, qc } = setup();
    const conflict = { entity: 'accounts', id: 'b', updated_by: 'sam', record_name: 'Joint', builtin_key: null, reason: 'changed' };
    fake.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    result.current.save([
      { account: account('a'), use: { kind: 'everyday' } },
      { account: account('b'), use: { kind: 'untouched' } },
    ]);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).toHaveBeenCalledWith({
      entity: 'accounts',
      entityId: 'b',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'accountUseSaved', n: 2, fields: ['use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside'] },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accounts(HH) });
    expect(getToast()).toMatchObject({ kind: 'refusal', refusal: { entity: 'accounts', id: 'b', reason: 'changed' } });
  });

  it('rolls the cache back on a rejection and records ids and counts only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    qc.setQueryData(queryKeys.accounts(HH), [account('a')]);
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    result.current.save([{ account: account('a'), use: { kind: 'mixed', extraSetAside: minorUnits(987654) } }]);
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<AccountRow[]>(queryKeys.accounts(HH))?.[0]?.use).toBeNull();
    const arg = recordFailedWrite.mock.calls[0][0] as { entity: string; entityId: string; kind: string };
    expect(arg.entity).toBe('accounts');
    expect(arg.entityId).toBe('bulk:step-1');
    expect(arg.kind).toBe('rejected');
    expect(JSON.stringify(arg)).not.toContain('987654');
  });

  it('ignores a discarded write (the session was wiped): nothing recorded', async () => {
    const { qc } = setup();
    const handler = qc.getMutationDefaults(mutationKeys.saveAccountUses).onError as (e: unknown, v: unknown) => Promise<void>;
    await handler(new SessionWipedError(), { items: [], settings: null, ownerId: USER, householdId: null, stepId: 's', labelKey: 'accountUseSaved' });
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('works offline: the cache shows the change, then one apply_patches replays on reconnect', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['accounts', 'a', 2]));
    onlineManager.setOnline(false);
    qc.setQueryData(queryKeys.accounts(HH), [account('a')]);
    const { result } = await renderHook(() => useSaveAccountUses(USER), { wrapper: wrapper(qc) });
    result.current.save([{ account: account('a'), use: { kind: 'everyday' } }]);
    await waitFor(() => expect(qc.getQueryData<AccountRow[]>(queryKeys.accounts(HH))?.[0]?.use).toBe('everyday'));
    expect(rpcCount(fake)).toBe(0);
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
  });
});

describe('useSaveAccountUse', () => {
  it('saves a mix with placements in one batch: the account plus each goal that moves', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['accounts', 'a', 2], ['savings_goals', 'g1', 2], ['savings_goals', 'g2', 4]));
    qc.setQueryData(queryKeys.savingsGoals(USER, HH), [goal('g1'), goal('g2', { version: 3, account_id: 'other' }), goal('g3', { account_id: 'a' })]);
    const { result } = await renderHook(() => useSaveAccountUse(USER), { wrapper: wrapper(qc) });
    const out = result.current.save({
      account: account('a'),
      use: { kind: 'mixed', extraSetAside: minorUnits(5000) },
      placements: [
        { goal: goal('g1'), accountId: 'a' },
        { goal: goal('g2', { version: 3, account_id: 'other' }), accountId: 'a' },
        { goal: goal('g3', { account_id: 'a' }), accountId: 'a' },
      ],
    });
    expect(out).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    const args = rpcArgs(fake);
    expect(args.p_ops.map((o) => [o.entity, o.id, o.expectedVersion])).toEqual([
      ['accounts', 'a', 1],
      ['savings_goals', 'g1', 1],
      ['savings_goals', 'g2', 3],
    ]);
    expect(args.p_ops[0]!.patch).toMatchObject({ use: 'mixed', use_extra_set_aside: 5000 });
    expect(args.p_ops[2]!.patch).toEqual({ account_id: 'a' });
    expect(args.p_undo_step.ops.map((o) => [o.entity, o.id, o.expectedVersion, o.patch])).toEqual([
      ['accounts', 'a', 2, { use: null, use_purpose: null, use_envelope_id: null, use_extra_set_aside: null }],
      ['savings_goals', 'g1', 2, { account_id: null }],
      ['savings_goals', 'g2', 4, { account_id: 'other' }],
    ]);
    await waitFor(() => {
      const rows = qc.getQueryData<SavingsGoalRow[]>(queryKeys.savingsGoals(USER, HH));
      expect(rows?.find((r) => r.id === 'g1')?.account_id).toBe('a');
    });
  });

  it('moves goals even when the account itself is unchanged, and ignores placements for a non-mixed use', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['savings_goals', 'g1', 2]));
    const { result } = await renderHook(() => useSaveAccountUse(USER), { wrapper: wrapper(qc) });
    const mixed = account('a', { use: 'mixed', use_extra_set_aside: null });
    result.current.save({ account: mixed, use: { kind: 'mixed', extraSetAside: null }, placements: [{ goal: goal('g1'), accountId: 'a' }] });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    expect(rpcArgs(fake).p_ops.map((o) => o.entity)).toEqual(['savings_goals']);

    expect(
      result.current.save({ account: mixed, use: { kind: 'mixed', extraSetAside: null }, placements: [{ goal: goal('g1'), accountId: 'a' }, { goal: goal('g1'), accountId: 'a' }] })
    ).not.toBeNull();
    expect(
      result.current.save({ account: account('e', { use: 'everyday' }), use: { kind: 'everyday' }, placements: [{ goal: goal('g9'), accountId: 'e' }] })
    ).toBeNull();
  });

  it('writes nothing for an unchanged account with no placements', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useSaveAccountUse(USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ account: account('a', { use: 'untouched' }), use: { kind: 'untouched' } })).toBeNull();
  });
});

describe('useSaveEmergencyFund', () => {
  it('saves amount, account and goal plus the account use in one batch with one undo step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['decide_settings', 'set-1', 4], ['accounts', 'a', 2]));
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ reserve: 100, reserve_goal: null }));
    qc.setQueryData(queryKeys.accounts(HH), [account('a')]);
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    const out = result.current.save({
      amount: 250000,
      accountId: 'a',
      goal: 500000,
      linkUse: { account: account('a'), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } },
    });
    expect(out).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    const args = rpcArgs(fake);
    expect(args.p_ops.map((o) => [o.entity, o.id, o.expectedVersion])).toEqual([
      ['accounts', 'a', 1],
      ['decide_settings', 'set-1', 3],
    ]);
    expect(args.p_ops[1]!.patch).toEqual({ reserve: 250000, reserve_account_id: 'a', reserve_goal: 500000 });
    expect(args.p_undo_step).toMatchObject({ label_key: 'emergencySaved' });
    expect(args.p_undo_step.ops[1]).toEqual({
      entity: 'decide_settings',
      id: 'set-1',
      expectedVersion: 4,
      patch: { reserve: 100, reserve_account_id: null, reserve_goal: null },
    });
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(queryKeys.decideSettings(USER))?.reserve).toBe(250000));
  });

  it('creates an empty settings row first when there is none cached', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: settings({ id: 'new-1', version: 1, currency: null }), error: null, status: 200 });
    fake.respondWith(applied(['decide_settings', 'new-1', 2]));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 1000, accountId: null, goal: null, linkUse: null });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true);
    expect(rpcArgs(fake).p_ops).toEqual([{ entity: 'decide_settings', id: 'new-1', expectedVersion: 1, patch: { reserve: 1000 } }]);
  });

  it('stamps the linked account currency when settings has none', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['decide_settings', 'set-1', 4], ['accounts', 'a', 2]));
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ currency: null }));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 1000, accountId: 'a', goal: null, linkUse: { account: account('a'), use: { kind: 'mixed', extraSetAside: null } } });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    const op = rpcArgs(fake).p_ops.find((o) => o.entity === 'decide_settings')!;
    expect(op.patch).toMatchObject({ currency: 'GBP', reserve: 1000 });
    expect(rpcArgs(fake).p_undo_step.ops.find((o) => o.entity === 'decide_settings')!.patch).toMatchObject({ currency: null });
  });

  it('writes only the link when the settings already match', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['accounts', 'a', 2]));
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ reserve: 10, reserve_account_id: 'a', reserve_goal: 20 }));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 10, accountId: 'a', goal: 20, linkUse: { account: account('a'), use: { kind: 'untouched' } } });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    expect(rpcArgs(fake).p_ops.map((o) => o.entity)).toEqual(['accounts']);
  });

  it('writes nothing when nothing changes', async () => {
    const { qc } = setup();
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ reserve: 10, reserve_account_id: null, reserve_goal: null }));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ amount: 10, accountId: null, goal: null, linkUse: null })).toBeNull();
  });

  it('removes the fund with one undo step, keeping the goal and moving nothing', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['decide_settings', 'set-1', 4]));
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ reserve: 100, reserve_account_id: 'a', reserve_goal: 900 }));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    expect(result.current.remove()).toEqual({ stepId: 'step-1' });
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
    const args = rpcArgs(fake);
    expect(args.p_ops).toEqual([{ entity: 'decide_settings', id: 'set-1', expectedVersion: 3, patch: { reserve: null, reserve_account_id: null } }]);
    expect(args.p_undo_step).toMatchObject({ label_key: 'emergencyRemoved' });
    expect(args.p_undo_step.ops[0]!.patch).toEqual({ reserve: 100, reserve_account_id: 'a' });
    const cached = qc.getQueryData<DecideSettingsRow>(queryKeys.decideSettings(USER));
    expect(cached?.reserve_goal).toBe(900);
  });

  it('remove still returns a step id when the fund is already empty', async () => {
    const { fake, qc } = setup();
    fake.respondWith(applied(['decide_settings', 'set-1', 4]));
    qc.setQueryData(queryKeys.decideSettings(USER), settings());
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    expect(result.current.remove().stepId).toBe('step-1');
    await waitFor(() => expect(rpcCount(fake)).toBe(1));
  });

  it('rolls the settings cache back on a rejection and records ids and field names only', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    qc.setQueryData(queryKeys.decideSettings(USER), settings({ reserve: 111111 }));
    const { result } = await renderHook(() => useSaveEmergencyFund(USER, USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 987654, accountId: null, goal: null, linkUse: null });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<DecideSettingsRow>(queryKeys.decideSettings(USER))?.reserve).toBe(111111);
    const arg = recordFailedWrite.mock.calls[0][0] as { entity: string };
    expect(arg.entity).toBe('decide_settings');
    const json = JSON.stringify(arg);
    expect(json).not.toContain('987654');
    expect(json).toContain('reserve');
  });
});
