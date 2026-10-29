// 05.2-43 (DSU-06): add, edit and paid-off of a loan or card are queued, undoable, version-conditional writes.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow, NewDebt } from '@/db/debts';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import { registerDebtMutations, useAddDebt, useEditDebt, useSetDebtPaidOff } from '../debts';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const KEY = queryKeys.debts('hh-1');

const debt = (overrides: Partial<DebtRow> = {}): DebtRow => ({
  id: 'd1',
  household_id: 'hh-1',
  account_id: null,
  check_id: null,
  series_id: null,
  name: 'Visa',
  kind: 'card',
  currency: 'GBP',
  balance: 120000,
  apr: '21.9',
  minimum_payment: 2500,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const NEW_ROW: Omit<NewDebt, 'id' | 'household_id'> = {
  account_id: null,
  series_id: null,
  name: ' Car loan ',
  kind: 'loan',
  currency: 'GBP',
  balance: 800000,
  apr: '5.5',
  minimum_payment: 20000,
  secured: true,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
};

const ok = (data: unknown) => ({ data, error: null, status: 200 });

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDebtMutations(qc);
  return { fake, qc };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  mockUuid = 0;
  onlineManager.setOnline(true);
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAddDebt', () => {
  it('registers defaults for all three keys', () => {
    const { qc } = setup();
    for (const k of [mutationKeys.addDebt, mutationKeys.editDebt, mutationKeys.setDebtPaidOff]) {
      expect(qc.getMutationDefaults(k).mutationFn).toBeDefined();
    }
  });

  it('inserts, adds optimistically and records one debtAdded step whose inverse soft-deletes', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-1', name: 'Car loan', kind: 'loan', version: 1 })));
    const { result } = await renderHook(() => useAddDebt(), { wrapper: wrapper(qc) });
    const out = result.current.add({ householdId: 'hh-1', ownerId: 'user-1', row: NEW_ROW });
    expect(out).toEqual({ id: 'id-1', stepId: 'id-2' });
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.map((r) => r.id)).toEqual(['id-1']));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ id: 'id-1', household_id: 'hh-1', name: 'Car loan' });
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: 'id-2',
      labelKey: 'debtAdded',
      labelParams: { name: 'Car loan' },
      ops: [{ entity: 'debts', id: 'id-1', expectedVersion: 1, patch: { deleted_at: '$now' } }],
    });
  });

  it('a replay after a landed insert reads the row back and records no failure', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    fake.respondWith(ok(debt({ id: 'id-1', version: 1 })));
    const { result } = await renderHook(() => useAddDebt(), { wrapper: wrapper(qc) });
    result.current.add({ householdId: 'hh-1', ownerId: 'user-1', row: NEW_ROW });
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('refuses invalid values before any write', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useAddDebt(), { wrapper: wrapper(qc) });
    const add = (row: Partial<typeof NEW_ROW>) => () => result.current.add({ householdId: 'hh-1', ownerId: 'u', row: { ...NEW_ROW, ...row } });
    expect(add({ name: '   ' })).toThrow(RangeError);
    expect(add({ apr: '100.5' })).toThrow(RangeError);
    expect(add({ apr: '1.234' })).toThrow(RangeError);
    expect(add({ balance: -1 })).toThrow(RangeError);
    expect(add({ minimum_payment: 1.5 })).toThrow(RangeError);
    expect(add({ pays_in_full: 'yes' })).toThrow(RangeError);
  });
});

describe('useEditDebt', () => {
  it('writes only the changed keys, version-conditional, with a debtEdited step restoring the old values', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt({ version: 3 })]);
    fake.respondWith(ok([debt({ balance: 90000, version: 4 })]));
    const { result } = await renderHook(() => useEditDebt(), { wrapper: wrapper(qc) });
    const stepId = result.current.edit(debt({ version: 3 }), { balance: 90000 }, 'user-1');
    expect(stepId).toBe('id-1');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ balance: 90000 });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 3]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      labelKey: 'debtEdited',
      labelParams: { name: 'Visa' },
      ops: [{ entity: 'debts', id: 'd1', expectedVersion: 4, patch: { balance: 120000 } }],
    });
  });

  it('refuses an empty patch, other keys (paid_off_on has its own action) and pays_in_full on a loan', async () => {
    const { qc } = setup();
    const { result } = await renderHook(() => useEditDebt(), { wrapper: wrapper(qc) });
    expect(() => result.current.edit(debt(), {}, 'u')).toThrow(RangeError);
    expect(() => result.current.edit(debt(), { paid_off_on: '2026-10-01' } as never, 'u')).toThrow(RangeError);
    expect(() => result.current.edit(debt({ kind: 'loan' }), { pays_in_full: 'yes' }, 'u')).toThrow(RangeError);
  });

  it('parks a version conflict as a failed write with field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(debt({ balance: 5, version: 5 })));
    const { result } = await renderHook(() => useEditDebt(), { wrapper: wrapper(qc) });
    result.current.edit(debt(), { balance: 777, name: 'Secret' }, 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    const record = recordFailedWrite.mock.calls[0]![0];
    expect(record).toMatchObject({ entity: 'debts', entityId: 'd1', kind: 'conflict', code: 'version-conflict' });
    expect(JSON.stringify(record)).not.toMatch(/Secret|777/);
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('queues while offline and writes on reconnect', async () => {
    const { fake, qc } = setup();
    onlineManager.setOnline(false);
    qc.setQueryData(KEY, [debt()]);
    const { result } = await renderHook(() => useEditDebt(), { wrapper: wrapper(qc) });
    result.current.edit(debt(), { minimum_payment: 3000 }, 'user-1');
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]?.minimum_payment).toBe(3000));
    expect(fake.calls.filter((c) => c.method === 'update')).toHaveLength(0);
    fake.respondWith(ok([debt({ minimum_payment: 3000, version: 2 })]));
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
  });
});

describe('useSetDebtPaidOff', () => {
  it('writes paid_off_on, version-conditional, with a debtPaidOff step that puts it back to null', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt({ version: 2 })]);
    fake.respondWith(ok([debt({ paid_off_on: '2026-10-20', version: 3 })]));
    const { result } = await renderHook(() => useSetDebtPaidOff(), { wrapper: wrapper(qc) });
    const stepId = result.current.setPaidOff(debt({ version: 2 }), '2026-10-20', 'user-1');
    await waitFor(() => expect(qc.getQueryData<DebtRow[]>(KEY)?.[0]?.paid_off_on).toBe('2026-10-20'));
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
    expect(fake.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ paid_off_on: '2026-10-20' });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 2]);
    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: stepId,
      labelKey: 'debtPaidOff',
      labelParams: { name: 'Visa' },
      ops: [{ entity: 'debts', id: 'd1', expectedVersion: 3, patch: { paid_off_on: null } }],
    });
  });

  it('accepts today and refuses a future date, a malformed date and an already paid-off debt', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([debt({ paid_off_on: '2026-10-28', version: 2 })]));
    const { result } = await renderHook(() => useSetDebtPaidOff(), { wrapper: wrapper(qc) });
    expect(() => result.current.setPaidOff(debt(), '2026-10-29', 'u')).toThrow(RangeError);
    expect(() => result.current.setPaidOff(debt(), '28/10/2026', 'u')).toThrow(RangeError);
    expect(() => result.current.setPaidOff(debt({ paid_off_on: '2026-09-01' }), '2026-10-01', 'u')).toThrow(RangeError);
    result.current.setPaidOff(debt(), '2026-10-28', 'u');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalledTimes(1));
  });

  it('parks a version conflict (attempted fields paid_off_on)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, [debt()]);
    fake.respondWith(ok([]));
    fake.respondWith(ok(debt({ version: 5 })));
    const { result } = await renderHook(() => useSetDebtPaidOff(), { wrapper: wrapper(qc) });
    result.current.setPaidOff(debt(), '2026-10-20', 'user-1');
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(recordFailedWrite.mock.calls[0]![0]).toMatchObject({
      entity: 'debts',
      entityId: 'd1',
      kind: 'conflict',
      code: 'version-conflict',
      attempted: { labelKey: 'debtPaidOff', fields: ['paid_off_on'] },
    });
  });
});

afterEach(() => {
  jest.useRealTimers();
});
