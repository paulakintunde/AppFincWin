// 06-30 (D-33, D-30, T-06-30-01/02): "Use $1,000 once" is ONE record_debt_one_off call with one server-built Undo step; it
// queues offline and replays once with the same ids; the payoff buttons name their start dates from the same helpers.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { extraStartDate, oneOffDate, registerGrowDebtMutations, useRecordDebtOneOff, useSaveDebtPlan } from '../growDebts';
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

const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').map((c) => c.args as [string, Record<string, any>]);

const INPUT = { ownerId: 'user-1', amount: 100000, paidFromAccountId: 'acc-chk', name: 'One-off payment · Auto loan' };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('start-date helpers (D-30: the button names its start date)', () => {
  it('extraStartDate is the next due date when a due day is set, else today', () => {
    expect(extraStartDate({ due_day: 15 }, '2026-11-05')).toBe('2026-11-15');
    expect(extraStartDate({ due_day: 3 }, '2026-11-05')).toBe('2026-12-03');
    expect(extraStartDate({ due_day: 31 }, '2026-02-10')).toBe('2026-02-28');
    expect(extraStartDate({ due_day: null }, '2026-11-05')).toBe('2026-11-05');
  });

  it('oneOffDate is today, as a local date', () => {
    expect(oneOffDate('2026-11-05')).toBe('2026-11-05');
    expect(oneOffDate()).toBe('2026-11-05');
  });

  it('useSaveDebtPlan anchors the extra on extraStartDate', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt({ due_day: 3 })]);
    fake.respondWith(ok({ status: 'applied', series_id: 'id-1', undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useSaveDebtPlan(), { wrapper: wrapper(qc) });
    result.current.save({ ownerId: 'user-1', debt: debt({ due_day: 3 }), extra: 5000, order: null, paidFromAccountId: 'acc-chk' });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]![1].p_series.anchor_date).toBe(extraStartDate({ due_day: 3 }, '2026-11-05'));
  });
});

describe('useRecordDebtOneOff', () => {
  it('ONE rpc call with the payment and the debtOneOffRecorded step; the step id comes back at once', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'applied', transaction_id: 'id-1', undo_step_id: 'id-2' }));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useRecordDebtOneOff(), { wrapper: wrapper(qc) });
    const out = result.current.record({ ...INPUT, debt: debt() });
    expect(out).toEqual({ stepId: 'id-2' });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    const calls = rpcCalls(fake);
    expect(calls).toHaveLength(1);
    const [name, args] = calls[0]!;
    expect(name).toBe('record_debt_one_off');
    expect(args.p_debt_id).toBe('d1');
    expect(args.p_payment).toEqual({
      id: 'id-1',
      account_id: 'acc-chk',
      amount: 100000,
      currency: 'USD',
      local_date: '2026-11-05',
      time_zone: 'UTC',
      name: 'One-off payment · Auto loan',
    });
    expect(args.p_undo_step).toEqual({ id: 'id-2', label_key: 'debtOneOffRecorded', label_params: { name: 'Auto loan' } });
    // The balance stays as it is: the line is Expected until marked paid.
    expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ balance: 842000 });
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(queryKeys.debts('hh-1')),
      JSON.stringify(queryKeys.transactionsRoot('hh-1')),
      JSON.stringify(queryKeys.transactionMonths('hh-1')),
      JSON.stringify(queryKeys.undoLog('user-1')),
    ]));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('already-applied is success, not a failed write', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok({ status: 'already-applied', undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useRecordDebtOneOff(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('a server refusal parks a failed write with no amounts or names', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'the payment is more than the debt', code: '22023' }, status: 400 });
    const { result } = await renderHook(() => useRecordDebtOneOff(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'debts', entityId: 'd1', kind: 'rejected', attempted: { labelKey: 'debtOneOffRecorded' } });
    expect(JSON.stringify(record)).not.toMatch(/100000|One-off|Auto loan/);
  });

  it('refuses a bad amount, an amount above the balance, a missing account, a bad name or a paid-off debt before anything is queued', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useRecordDebtOneOff(), { wrapper: wrapper(qc) });
    expect(() => result.current.record({ ...INPUT, debt: debt(), amount: 0 })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), amount: 10.5 })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), amount: 842001 })).toThrow('payment-exceeds-balance');
    expect(() => result.current.record({ ...INPUT, debt: debt(), paidFromAccountId: '' })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), name: ' ' })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt({ paid_off_on: '2026-10-01' }) })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, amount: 842000, debt: debt() })).not.toThrow();
    expect(qc.getMutationCache().getAll()).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === 'rpc' && (c.args as [string])[0] !== 'record_debt_one_off')).toHaveLength(0);
  });

  it('queues while offline and replays once with the same ids on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useRecordDebtOneOff(), { wrapper: wrapper(qc) });
    const out = result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    expect(rpcCalls(fake)).toHaveLength(0);
    fake.respondWith(ok({ status: 'applied', transaction_id: 'id-1', undo_step_id: out.stepId }));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    const [, args] = rpcCalls(fake)[0]!;
    expect(args.p_payment.id).toBe('id-1');
    expect(args.p_undo_step.id).toBe(out.stepId);
  });
});
