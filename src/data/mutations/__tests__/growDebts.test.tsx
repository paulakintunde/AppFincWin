// 06-14 (GRW-04, GRW-07, GRW-08, D-15): Grow's debt form and the payoff plan are queued, undoable, version-conditional writes.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { clampLineName, registerGrowDebtMutations, useSaveDebtPlan, useSaveGrowDebt } from '../growDebts';
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

const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const KEY = queryKeys.debts('hh-1');
const ok = (data: unknown) => ({ data, error: null, status: 200 });

const debt = (over: Partial<DebtRow> = {}): DebtRow => ({
  id: 'd1',
  household_id: 'hh-1',
  account_id: null,
  check_id: null,
  series_id: null,
  name: 'Auto loan',
  kind: 'loan',
  currency: 'USD',
  balance: 842000,
  apr: '6.9',
  minimum_payment: 31200,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  due_day: 15,
  started_balance: 1450000,
  payoff_order: null,
  payoff_extra: 0,
  extra_series_id: null,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 2,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerGrowDebtMutations(qc);
  return { fake, qc };
}

const rpcCall = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, any>];
const insertArg = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, any>;

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
  it('registers defaults for the three keys', () => {
    const { qc } = setup();
    for (const k of [mutationKeys.saveGrowDebt, mutationKeys.saveDebtPlan, mutationKeys.recordDebtSale]) {
      expect(qc.getMutationDefaults(k).mutationFn).toBeDefined();
    }
  });
});

describe('useSaveGrowDebt', () => {
  it('adds a loan: started balance defaults to the balance, one debtAdded step', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-2', version: 1, started_balance: 842000 })));
    const { result } = await renderHook(() => useSaveGrowDebt(), { wrapper: wrapper(qc) });
    const out = result.current.save({
      ownerId: 'user-1',
      householdId: 'hh-1',
      fields: { name: ' Auto loan ', kind: 'loan', currency: 'USD', balance: 842000, apr: '6.9', minimum_payment: 31200, due_day: 15 },
    });
    expect(out).toEqual({ id: 'id-2', stepId: 'id-1' });
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-2']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertArg(fake)).toMatchObject({
      id: 'id-2',
      household_id: 'hh-1',
      name: 'Auto loan',
      kind: 'loan',
      balance: 842000,
      apr: '6.9',
      minimum_payment: 31200,
      due_day: 15,
      started_balance: 842000,
      pays_in_full: null,
    });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ labelKey: 'debtAdded', labelParams: { name: 'Auto loan' } });
  });

  it('a card paid in full needs no rate or minimum; Not sure is kept as null', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-1', kind: 'card', pays_in_full: 'yes' })));
    fake.respondWith(ok(debt({ id: 'id-3', kind: 'card', pays_in_full: null })));
    const { result } = await renderHook(() => useSaveGrowDebt(), { wrapper: wrapper(qc) });
    result.current.save({
      ownerId: 'u',
      householdId: 'hh-1',
      fields: { name: 'Amex', kind: 'card', currency: 'USD', balance: 50000, pays_in_full: 'yes', apr: '19.9', minimum_payment: 5000 },
    });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'insert')).toBe(true));
    expect(insertArg(fake)).toMatchObject({ pays_in_full: 'yes', apr: null, minimum_payment: 0 });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    result.current.save({
      ownerId: 'u',
      householdId: 'hh-1',
      fields: { name: 'Visa', kind: 'card', currency: 'USD', balance: 420000, pays_in_full: null, apr: '21.9' },
    });
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(2));
    const second = fake.calls.filter((c) => c.method === 'insert')[1]?.args[0] as Record<string, any>;
    expect(second).toMatchObject({ pays_in_full: null, apr: '21.9', minimum_payment: 0 });
  });

  it('edits with the expected version and one debtEdited step that puts the old values back', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok([debt({ balance: 800000, version: 3 })]));
    const { result } = await renderHook(() => useSaveGrowDebt(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', existing: debt(), fields: { balance: 800000 } });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ balance: 800000 });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 2]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'debtEdited',
      ops: [{ entity: 'debts', id: 'd1', expectedVersion: 3, patch: { balance: 842000 } }],
    });
  });

  it('refuses bad values before anything is queued', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveGrowDebt(), { wrapper: wrapper(qc) });
    const base = { ownerId: 'u', householdId: 'hh-1' } as const;
    const f = { name: 'X', kind: 'loan', currency: 'USD', balance: 100 } as const;
    expect(() => result.current.save({ ...base, fields: { ...f, name: '  ' } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...f, balance: 1.5 } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...f, apr: '120' } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...f, due_day: 32 } })).toThrow(RangeError);
    expect(() => result.current.save({ ...base, fields: { ...f, pays_in_full: 'yes' } })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', existing: debt(), fields: {} })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', existing: debt(), fields: { is_housing: true } as never })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', existing: debt(), fields: { pays_in_full: 'yes' } })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('parks a version conflict with field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(debt({ version: 9 })));
    const { result } = await renderHook(() => useSaveGrowDebt(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', existing: debt(), fields: { name: 'Secret loan', balance: 777777 } });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'debts', entityId: 'd1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Secret|777777/);
  });
});

describe('useSaveDebtPlan', () => {
  it('an extra sends a monthly record on the due day and one debtPlanSaved step (the server builds the ops)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'applied', series_id: 'id-1', undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    const out = result.current.save({ ownerId: 'user-1', debt: debt(), extra: 5000, order: 'balance', paidFromAccountId: 'acc-chk' });
    expect(out.stepId).toBe('id-2');
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ payoff_extra: 5000, payoff_order: 'balance' }));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [name, args] = rpcCall(fake);
    expect(name).toBe('save_debt_plan');
    expect(args).toMatchObject({ p_debt_id: 'd1', p_expected_version: 2, p_extra: 5000, p_order: 'balance' });
    expect(args.p_series).toMatchObject({ id: 'id-1', account_id: 'acc-chk', anchor_date: '2026-11-15', time_zone: 'UTC', name: 'Auto loan' });
    expect(args.p_undo_step).toEqual({ id: 'id-2', label_key: 'debtPlanSaved', label_params: { name: 'Auto loan' } });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
    // The server owns the step: the client records none.
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('extra 0 sends no series and still uses debtPlanSaved', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'applied', series_id: null, undo_step_id: 'id-1' }));
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', debt: debt({ payoff_extra: 5000 }), extra: 0, order: null });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const [, args] = rpcCall(fake);
    expect(args.p_series).toBeNull();
    expect(args.p_extra).toBe(0);
    expect(args.p_undo_step.label_key).toBe('debtPlanSaved');
  });

  it('refuses an extra without an account, a bad extra and a bad order', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    expect(() => result.current.save({ ownerId: 'u', debt: debt(), extra: 5000, order: 'rate' })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', debt: debt(), extra: -1, order: 'rate' })).toThrow(RangeError);
    expect(() => result.current.save({ ownerId: 'u', debt: debt(), extra: 0, order: 'size' as never })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a conflict is parked without amounts and the debts are refetched', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'conflict' }));
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'u', debt: debt(), extra: 7777, order: 'rate', paidFromAccountId: 'a' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({ entity: 'debts', kind: 'conflict' });
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toMatch(/7777|Auto loan/);
  });

  it('queues while offline and replays on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'u', debt: debt(), extra: 0, order: null });
    await waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(0);
    fake.respondWith(ok({ status: 'applied', series_id: null, undo_step_id: 'id-1' }));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1));
  });
});

describe('06 review P3-WR-07: clampLineName', () => {
  it('keeps a name of up to 80 characters and cuts a longer one to 80 with an ellipsis', () => {
    expect(clampLineName('  Car final payment ')).toBe('Car final payment');
    expect(clampLineName('a'.repeat(80))).toBe('a'.repeat(80));
    const long = clampLineName('b'.repeat(95));
    expect(Array.from(long)).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
