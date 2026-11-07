// 06-14 (D-16, T-06-14-01): "I sold it" is ONE record_debt_sale call, one Undo step, and the cache follows the server's answer.
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
import { registerGrowDebtMutations, useRecordDebtSale } from '../growDebts';
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

const INPUT = {
  ownerId: 'user-1',
  soldFor: 1000000,
  paidToLoan: 842000,
  saleAccountId: 'acc-chk',
  paymentAccountId: 'acc-chk',
  saleName: 'Car sold',
  paymentName: 'Auto loan final payment',
};

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

describe('useRecordDebtSale', () => {
  it('sells for 1000000 and pays 842000: ONE rpc call with both legs and the debtSaleRecorded step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'applied', paid_off: true, still_owed: 0, undo_step_id: 'id-3' }));
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    const out = result.current.record({ ...INPUT, debt: debt() });
    expect(out).toEqual({ stepId: 'id-3', leftOver: 158000 });
    // The cache marks the debt paid off at once.
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ balance: 0, paid_off_on: '2026-11-05' }));
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    const calls = rpcCalls(fake);
    expect(calls).toHaveLength(1);
    const [name, args] = calls[0]!;
    expect(name).toBe('record_debt_sale');
    expect(args.p_debt_id).toBe('d1');
    expect(args.p_expected_version).toBe(2);
    expect(args.p_sale).toMatchObject({ id: 'id-1', account_id: 'acc-chk', amount: 1000000, currency: 'USD', local_date: '2026-11-05', name: 'Car sold' });
    expect(args.p_payment).toMatchObject({ id: 'id-2', amount: 842000, name: 'Auto loan final payment' });
    expect(args.p_undo_step).toEqual({ id: 'id-3', label_key: 'debtSaleRecorded', label_params: { name: 'Auto loan' } });
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('a payment short of the balance keeps the debt open at what the server says is still owed', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'applied', paid_off: false, still_owed: 342000, undo_step_id: 'id-3' }));
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt(), soldFor: 500000, paidToLoan: 500000 });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ balance: 342000, paid_off_on: null });
  });

  it('a sale alone sends no payment and leaves the debt as it is', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'applied', paid_off: false, still_owed: 842000, undo_step_id: 'id-2' }));
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    const out = result.current.record({ ...INPUT, debt: debt(), paidToLoan: 0, paymentAccountId: null });
    expect(out.leftOver).toBe(1000000);
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]![1].p_payment).toBeNull();
    expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]).toMatchObject({ balance: 842000, paid_off_on: null });
  });

  it('already-applied is success, not a failed write', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'already-applied', undo_step_id: 'id-3' }));
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('a conflict parks a failed write with no amounts or names', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok({ status: 'conflict' }));
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'debts', entityId: 'd1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/1000000|842000|Car sold|Auto loan/);
  });

  it('refuses a payment above the balance, a missing account and bad amounts before anything is queued', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    expect(() => result.current.record({ ...INPUT, debt: debt(), paidToLoan: 842001 })).toThrow('payment-exceeds-balance');
    expect(() => result.current.record({ ...INPUT, debt: debt(), paymentAccountId: null })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), soldFor: 0 })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), soldFor: 10.5 })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), saleName: ' ' })).toThrow(RangeError);
    expect(() => result.current.record({ ...INPUT, debt: debt(), date: 'tomorrow' })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('queues while offline: still one call on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useRecordDebtSale(), { wrapper: wrapper(qc) });
    result.current.record({ ...INPUT, debt: debt() });
    await waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(rpcCalls(fake)).toHaveLength(0);
    fake.respondWith(ok({ status: 'applied', paid_off: true, still_owed: 0, undo_step_id: 'id-3' }));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  });
});
