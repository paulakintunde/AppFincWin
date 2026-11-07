// 06-14 (GRW-05, GRW-06, GRW-10, GRW-11, T-06-14-02): holdings, entries, hand-typed values and an account's rate are queued,
// undoable, version-conditional writes. A sale beyond the units held is refused before anything is queued.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, DbClient } from '@/db/rows';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow } from '@/db/holdings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import {
  registerGrowHoldingMutations,
  useAddHolding,
  useAddHoldingLot,
  useEditHolding,
  useEditHoldingLot,
  useSetAccountRate,
} from '../growHoldings';
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

const HKEY = queryKeys.holdings('user-1', 'hh-1');
const LKEY = queryKeys.holdingLots('user-1', 'hh-1');
const ok = (data: unknown) => ({ data, error: null, status: 200 });

const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  id: 'h1',
  household_id: 'hh-1',
  created_by: 'user-1',
  updated_by: null,
  name: 'Retirement',
  type: 'retirement',
  currency: 'USD',
  value: 645000,
  value_as_of: '2026-11-01',
  opening_put_in: 500000,
  account_id: null,
  paid_from_account_id: null,
  monthly_amount: 15000,
  day: null,
  rate: null,
  is_sample: false,
  deleted_at: null,
  version: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const lot = (over: Partial<HoldingLotRow> = {}): HoldingLotRow => ({
  id: 'l1',
  holding_id: 'h1',
  household_id: 'hh-1',
  created_by: 'user-1',
  updated_by: null,
  kind: 'buy',
  amount: 80000,
  units: '10',
  local_date: '2026-06-01',
  note: null,
  is_sample: false,
  deleted_at: null,
  version: 2,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const account = (over: Partial<AccountRow> = {}): AccountRow =>
  ({
    id: 'acc-sav',
    household_id: 'hh-1',
    created_by: 'user-1',
    name: 'Savings',
    kind: 'savings',
    currency: 'USD',
    opening_balance: 0,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    interest_rate: null,
    deleted_at: null,
    is_sample: false,
    version: 4,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  }) as AccountRow;

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerGrowHoldingMutations(qc);
  return { fake, qc };
}

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
  it('registers defaults for all five keys', () => {
    const { qc } = setup();
    for (const k of [mutationKeys.addHolding, mutationKeys.editHolding, mutationKeys.addHoldingLot, mutationKeys.editHoldingLot, mutationKeys.setAccountRate]) {
      expect(qc.getMutationDefaults(k).mutationFn).toBeDefined();
    }
  });
});

describe('useAddHolding', () => {
  const INPUT = { ownerId: 'user-1', householdId: 'hh-1', name: ' Retirement ', type: 'retirement', currency: 'USD', value: 645000, openingPutIn: 580000 } as const;

  it('one insert, a holdingAdded step, an optimistic row, value date defaults to today', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(holding({ id: 'id-1', version: 1, value_as_of: '2026-11-05' })));
    const { result } = await renderHook(() => useAddHolding(), { wrapper: wrapper(qc) });
    const out = result.current.add(INPUT);
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(qc.getQueryData<HoldingRow[]>(HKEY)?.map((r) => r.id)).toEqual(['id-1']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertArg(fake)).toMatchObject({ id: 'id-1', household_id: 'hh-1', name: 'Retirement', type: 'retirement', value: 645000, value_as_of: '2026-11-05', opening_put_in: 580000 });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'holdingAdded',
      labelParams: { name: 'Retirement' },
      ops: [{ entity: 'holdings', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
  });

  it('refuses a sixth type, bad values, a future date and a bad rate before anything is queued', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useAddHolding(), { wrapper: wrapper(qc) });
    expect(() => result.current.add({ ...INPUT, type: 'bonds' as never })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, name: ' ' })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, value: 1.5 })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, openingPutIn: -1 })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, valueAsOf: '2026-11-06' })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, rate: '6.5%' })).toThrow(RangeError);
    expect(() => result.current.add({ ...INPUT, day: 32 })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a rejected insert leaves the cache and is parked without the name', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    const { result } = await renderHook(() => useAddHolding(), { wrapper: wrapper(qc) });
    result.current.add({ ...INPUT, name: 'Secret fund' });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<HoldingRow[]>(HKEY)).toEqual([]);
    expect(JSON.stringify(recordFailedWrite.mock.calls[0]![0])).not.toMatch(/Secret|645000/);
  });

  it('queues while offline and replays on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useAddHolding(), { wrapper: wrapper(qc) });
    result.current.add(INPUT);
    await waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(0);
    fake.respondWith(ok(holding({ id: 'id-2', version: 1 })));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(1));
  });
});

describe('useEditHolding', () => {
  it('patches only the given keys with a holdingEdited step that puts the old values back', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(HKEY, [holding()]);
    fake.respondWith(ok([holding({ name: 'Pension', version: 4 })]));
    const { result } = await renderHook(() => useEditHolding(), { wrapper: wrapper(qc) });
    result.current.edit(holding(), { name: ' Pension ' }, 'user-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Pension' });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 3]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'holdingEdited',
      ops: [{ entity: 'holdings', id: 'h1', expectedVersion: 4, patch: { name: 'Retirement' } }],
    });
  });

  it('remove soft-deletes with a holdingRemoved step and drops the row', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(HKEY, [holding()]);
    fake.respondWith(ok([holding({ deleted_at: '2026-11-05T12:00:00Z', version: 4 })]));
    const { result } = await renderHook(() => useEditHolding(), { wrapper: wrapper(qc) });
    result.current.remove(holding(), 'user-1');
    await waitFor(() => expect(qc.getQueryData<HoldingRow[]>(HKEY)).toEqual([]));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'holdingRemoved',
      ops: [{ entity: 'holdings', id: 'h1', expectedVersion: 4, patch: { deleted_at: null } }],
    });
  });

  it('refuses other keys, an empty patch, bad values and a second removal', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useEditHolding(), { wrapper: wrapper(qc) });
    expect(() => result.current.edit(holding(), {}, 'u')).toThrow(RangeError);
    expect(() => result.current.edit(holding(), { value: 1 } as never, 'u')).toThrow(RangeError);
    expect(() => result.current.edit(holding(), { type: 'bonds' as never }, 'u')).toThrow(RangeError);
    expect(() => result.current.edit(holding(), { rate: 'lots' }, 'u')).toThrow(RangeError);
    expect(() => result.current.remove(holding({ deleted_at: 'x' }), 'u')).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('parks a version conflict with field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(HKEY, [holding()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(holding({ version: 9 })));
    const { result } = await renderHook(() => useEditHolding(), { wrapper: wrapper(qc) });
    result.current.edit(holding(), { name: 'Secret fund', opening_put_in: 777777 }, 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'holdings', entityId: 'h1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Secret|777777/);
  });
});

describe('useAddHoldingLot', () => {
  it('Update value is a value entry with the holdingValueUpdated step; the holding shows the new value at once', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(HKEY, [holding()]);
    fake.respondWith(ok(lot({ id: 'id-1', kind: 'value', amount: 700000, units: null, local_date: '2026-11-05', version: 1 })));
    const { result } = await renderHook(() => useAddHoldingLot(), { wrapper: wrapper(qc) });
    const out = result.current.add({ ownerId: 'user-1', holding: holding(), lots: [], kind: 'value', amount: 700000 });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(qc.getQueryData<HoldingRow[]>(HKEY)?.[0]).toMatchObject({ value: 700000, value_as_of: '2026-11-05' }));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertArg(fake)).toMatchObject({ kind: 'value', amount: 700000, local_date: '2026-11-05', holding_id: 'h1', units: null });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ labelKey: 'holdingValueUpdated', labelParams: { name: 'Retirement' } });
  });

  it('a buy uses holdingEntryAdded', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(lot({ id: 'id-2', version: 1 })));
    const { result } = await renderHook(() => useAddHoldingLot(), { wrapper: wrapper(qc) });
    result.current.add({ ownerId: 'user-1', holding: holding(), lots: [], kind: 'buy', amount: 80000, units: '10.5', date: '2026-06-01', note: 'monthly' });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertArg(fake)).toMatchObject({ kind: 'buy', amount: 80000, units: '10.5', local_date: '2026-06-01', note: 'monthly' });
    expect(insertUndoStep.mock.calls[0]![1].labelKey).toBe('holdingEntryAdded');
  });

  it('refuses a sale beyond the units held, before anything is queued (T-06-14-02)', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useAddHoldingLot(), { wrapper: wrapper(qc) });
    const held = [lot({ units: '10' })];
    expect(() => result.current.add({ ownerId: 'u', holding: holding(), lots: held, kind: 'sell', amount: 50000, units: '10.00000001', date: '2026-07-01' })).toThrow('sell-exceeds-units');
    expect(() => result.current.add({ ownerId: 'u', holding: holding(), lots: [], kind: 'sell', amount: 50000, units: '1' })).toThrow('sell-exceeds-units');
    expect(() => result.current.add({ ownerId: 'u', holding: holding(), lots: held, kind: 'sell', amount: 50000, units: '10', date: '2026-07-01' })).not.toThrow();
    expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(0); // the allowed one is queued, not yet sent
  });

  it('refuses bad kinds, amounts, units, notes, dates and units on a dividend', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useAddHoldingLot(), { wrapper: wrapper(qc) });
    const base = { ownerId: 'u', holding: holding(), lots: [] } as const;
    expect(() => result.current.add({ ...base, kind: 'gift' as never, amount: 1 })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, kind: 'buy', amount: 0 })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, kind: 'value', amount: -1 })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, kind: 'buy', amount: 5, units: '1,5' })).toThrow('bad-units');
    expect(() => result.current.add({ ...base, kind: 'dividend', amount: 5, units: '1' })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, kind: 'buy', amount: 5, note: 'x'.repeat(201) })).toThrow(RangeError);
    expect(() => result.current.add({ ...base, kind: 'buy', amount: 5, date: '2026-11-06' })).toThrow(RangeError);
  });
});

describe('useEditHoldingLot', () => {
  it('remove soft-deletes with a holdingEntryRemoved step and refreshes the holdings', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(LKEY, [lot()]);
    fake.respondWith(ok([lot({ deleted_at: '2026-11-05T12:00:00Z', version: 3 })]));
    const { result } = await renderHook(() => useEditHoldingLot(), { wrapper: wrapper(qc) });
    result.current.remove(lot(), holding(), [lot()], 'user-1');
    await waitFor(() => expect(qc.getQueryData<HoldingLotRow[]>(LKEY)).toEqual([]));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'holdingEntryRemoved',
      labelParams: { name: 'Retirement' },
      ops: [{ entity: 'holding_lots', id: 'l1', expectedVersion: 3, patch: { deleted_at: null } }],
    });
  });

  it('edit patches the given keys with holdingEntryEdited', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(LKEY, [lot()]);
    fake.respondWith(ok([lot({ amount: 90000, version: 3 })]));
    const { result } = await renderHook(() => useEditHoldingLot(), { wrapper: wrapper(qc) });
    result.current.edit(lot(), { amount: 90000 }, holding(), [lot()], 'user-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ amount: 90000 });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({ labelKey: 'holdingEntryEdited', ops: [{ patch: { amount: 80000 } }] });
  });

  it('refuses a change or removal that would leave a sale larger than the units held', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useEditHoldingLot(), { wrapper: wrapper(qc) });
    const buy = lot();
    const sell = lot({ id: 'l2', kind: 'sell', units: '6', amount: 40000, local_date: '2026-07-01' });
    expect(() => result.current.remove(buy, holding(), [buy, sell], 'u')).toThrow('sell-exceeds-units');
    expect(() => result.current.edit(buy, { units: '5' }, holding(), [buy, sell], 'u')).toThrow('sell-exceeds-units');
    expect(() => result.current.edit(buy, {}, holding(), [buy], 'u')).toThrow(RangeError);
    expect(() => result.current.edit(buy, { kind: 'sell' } as never, holding(), [buy], 'u')).toThrow(RangeError);
    expect(() => result.current.remove(lot({ deleted_at: 'x' }), holding(), [], 'u')).toThrow(RangeError);
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(0);
  });
});

describe('useSetAccountRate', () => {
  it('patches interest_rate with an accountRateSaved step that puts the old rate back', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.accounts('hh-1'), [account({ interest_rate: '3.5' })]);
    fake.respondWith(ok([account({ interest_rate: '4.25', version: 5 })]));
    const { result } = await renderHook(() => useSetAccountRate(), { wrapper: wrapper(qc) });
    const stepId = result.current.set(account({ interest_rate: '3.5' }), ' 4.25 ', 'user-1');
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(qc.getQueryData<AccountRow[]>(queryKeys.accounts('hh-1'))?.[0]?.interest_rate).toBe('4.25'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ interest_rate: '4.25' });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'accountRateSaved',
      labelParams: { name: 'Savings' },
      ops: [{ entity: 'accounts', id: 'acc-sav', expectedVersion: 5, patch: { interest_rate: '3.5' } }],
    });
  });

  it('empty clears the rate; bad percents are refused', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([account({ interest_rate: null, version: 5 })]));
    const { result } = await renderHook(() => useSetAccountRate(), { wrapper: wrapper(qc) });
    result.current.set(account({ interest_rate: '3.5' }), '  ', 'user-1');
    await waitFor(() => expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ interest_rate: null }));
    expect(() => result.current.set(account(), '4.5%', 'u')).toThrow(RangeError);
    expect(() => result.current.set(account(), '-1', 'u')).toThrow(RangeError);
    expect(() => result.current.set(account(), '101', 'u')).toThrow(RangeError);
    expect(() => result.current.set(account(), '1.12345678901', 'u')).toThrow(RangeError);
  });
});
