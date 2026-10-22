// 05-19: links, card rates and terms, and statement periods through the write queue.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import type { DecideLinkRow } from '@/db/decideLinks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { resetToastForTests } from '@/state/undoToast';
import {
  registerDecideLinkMutations,
  useAttachLine,
  useRecordStatementPeriod,
  useSaveCardRate,
  useSaveCardTerms,
  useUnlinkLine,
  type DebtWriteVars,
} from '../decideLinks';
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

const ok = (data: unknown) => ({ data, error: null, status: 200 });

const debt = (overrides: Partial<DebtRow> = {}): DebtRow => ({
  id: 'd1',
  household_id: 'hh-1',
  account_id: 'acc-1',
  check_id: null,
  series_id: null,
  name: 'Visa',
  kind: 'card',
  currency: 'USD',
  balance: 0,
  apr: null,
  minimum_payment: 0,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const link = (overrides: Partial<DecideLinkRow> = {}): DecideLinkRow => ({
  id: 'l1',
  household_id: 'hh-1',
  created_by: 'user-1',
  check_id: 'c1',
  entity: 'transactions',
  target_id: 't1',
  source: 'attached',
  role: 'day_one',
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const CARD = { userId: 'user-1', householdId: 'hh-1', accountId: 'acc-1', currency: 'USD', accountName: 'Visa' };

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideLinkMutations(qc);
  return { fake, qc };
}

const inserts = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'insert');
const updates = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'update');

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  resetToastForTests();
  recordFailedWrite.mockClear();
  insertUndoStep.mockClear();
});

describe('useAttachLine', () => {
  it('inserts a link with a role by date: within 7 days is day one, later is a running cost', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(link({ id: 'id-1' })));
    fake.respondWith(ok(link({ id: 'id-2', role: 'running_cost' })));
    const { result } = await renderHook(() => useAttachLine(), { wrapper: wrapper(qc) });
    const base = {
      userId: 'user-1',
      checkId: 'c1',
      householdId: 'hh-1',
      entity: 'transactions' as const,
      decidedAt: '2026-10-01T12:00:00Z',
      timeZone: 'UTC',
    };

    result.current.attach({ ...base, targetId: 't1', lineDate: '2026-10-05' });
    await waitFor(() => expect(inserts(fake)).toHaveLength(1));
    result.current.attach({ ...base, targetId: 't2', lineDate: '2026-11-20' });
    await waitFor(() => expect(inserts(fake)).toHaveLength(2));

    expect(inserts(fake)[0]!.args[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      check_id: 'c1',
      entity: 'transactions',
      target_id: 't1',
      role: 'day_one',
    });
    expect(inserts(fake)[1]!.args[0]).toMatchObject({ target_id: 't2', role: 'running_cost' });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });
});

describe('useUnlinkLine', () => {
  it('soft deletes the link and records a lineUnlinked step that restores it', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([link({ deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useUnlinkLine(), { wrapper: wrapper(qc) });

    const stepId = result.current.unlink(link(), 'Laptop');
    await waitFor(() => expect(insertUndoStep).toHaveBeenCalled());

    expect(insertUndoStep.mock.calls[0]![1]).toMatchObject({
      id: stepId,
      labelKey: 'lineUnlinked',
      labelParams: { name: 'Laptop' },
      ops: [{ entity: 'decide_links', id: 'l1', expectedVersion: 2, patch: { deleted_at: null } }],
    });
  });

  it('drops the link from cached lists at once', async () => {
    const { fake, qc } = setup();
    const key = [...queryKeys.decideLinks('user-1', 'hh-1'), 'c1'];
    qc.setQueryData(key, [link(), link({ id: 'l2' })]);
    fake.respondWith(ok([link({ deleted_at: '2026-10-02T00:00:00Z', version: 2 })]));
    const { result } = await renderHook(() => useUnlinkLine(), { wrapper: wrapper(qc) });

    result.current.unlink(link(), 'Laptop');
    await waitFor(() => expect(qc.getQueryData<DecideLinkRow[]>(key)?.map((l) => l.id)).toEqual(['l2']));
  });
});

describe('useSaveCardRate', () => {
  it('inserts a card debt with the typed rate when the card has none', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-1', apr: '22.9' })));
    const { result } = await renderHook(() => useSaveCardRate(), { wrapper: wrapper(qc) });

    result.current.save({ ...CARD, existing: null, aprText: '22.9' });
    await waitFor(() => expect(inserts(fake)).toHaveLength(1));

    expect(inserts(fake)[0]!.args[0]).toMatchObject({
      kind: 'card',
      account_id: 'acc-1',
      name: 'Visa',
      currency: 'USD',
      balance: 0,
      apr: '22.9',
      paid_in_full: false,
    });
  });

  it('updates the existing record version-conditionally and rejects non-percent text before queuing', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok([debt({ apr: '19.5', version: 2 })]));
    const { result } = await renderHook(() => useSaveCardRate(), { wrapper: wrapper(qc) });

    expect(() => result.current.save({ ...CARD, existing: null, aprText: '19,5' })).toThrow(RangeError);
    expect(() => result.current.save({ ...CARD, existing: null, aprText: '' })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);

    result.current.save({ ...CARD, existing: debt(), aprText: '19.5' });
    await waitFor(() => expect(updates(fake)).toHaveLength(1));
    expect(updates(fake)[0]!.args[0]).toEqual({ apr: '19.5' });
    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version' && c.args[1] === 1)).toBe(true);
  });

  it('reuses a queued card record instead of inserting a second one', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(queryKeys.debts('hh-1'), [debt({ id: 'queued' })]);
    fake.respondWith(ok([debt({ id: 'queued', apr: '10', version: 2 })]));
    const { result } = await renderHook(() => useSaveCardRate(), { wrapper: wrapper(qc) });

    result.current.save({ ...CARD, existing: null, aprText: '10' });
    await waitFor(() => expect(updates(fake)).toHaveLength(1));
    expect(inserts(fake)).toHaveLength(0);
  });
});

describe('useSaveCardTerms', () => {
  it('card terms and paid in full save to the card debt', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-1', min_percent: '2', min_interest_added: true, min_floor: 2500 })));
    fake.respondWith(
      ok([debt({ min_percent: '3', min_interest_added: false, min_floor: 1500, paid_in_full: true, version: 2 })])
    );
    fake.respondWith(ok([debt({ version: 3 })]));
    const { result } = await renderHook(() => useSaveCardTerms(), { wrapper: wrapper(qc) });

    // Inserts the record when the card has none.
    result.current.save({
      ...CARD,
      existing: null,
      terms: { percentText: '2', interestAdded: true, floor: 2500, paidInFull: false },
    });
    await waitFor(() => expect(inserts(fake)).toHaveLength(1));
    expect(inserts(fake)[0]!.args[0]).toMatchObject({
      kind: 'card',
      account_id: 'acc-1',
      apr: null,
      min_percent: '2',
      min_interest_added: true,
      min_floor: 2500,
      paid_in_full: false,
    });

    // Updates with the version, including the paid-in-full flag.
    result.current.save({
      ...CARD,
      existing: debt(),
      terms: { percentText: '3', interestAdded: false, floor: 1500, paidInFull: true },
    });
    await waitFor(() => expect(updates(fake)).toHaveLength(1));
    expect(updates(fake)[0]!.args[0]).toEqual({
      min_percent: '3',
      min_interest_added: false,
      min_floor: 1500,
      paid_in_full: true,
    });

    // 'Use the standard terms' sends three nulls.
    result.current.save({
      ...CARD,
      existing: debt({ version: 2 }),
      terms: { percentText: null, interestAdded: null, floor: null, paidInFull: false },
    });
    await waitFor(() => expect(updates(fake)).toHaveLength(2));
    expect(updates(fake)[1]!.args[0]).toEqual({
      min_percent: null,
      min_interest_added: null,
      min_floor: null,
      paid_in_full: false,
    });
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('rejects malformed terms before queuing: bad percent, bad floor, partial set', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useSaveCardTerms(), { wrapper: wrapper(qc) });
    const terms = { percentText: '2', interestAdded: true, floor: 2500, paidInFull: false };

    expect(() => result.current.save({ ...CARD, existing: null, terms: { ...terms, percentText: '2%' } })).toThrow(RangeError);
    expect(() => result.current.save({ ...CARD, existing: null, terms: { ...terms, floor: -1 } })).toThrow(RangeError);
    expect(() => result.current.save({ ...CARD, existing: null, terms: { ...terms, floor: 12.5 } })).toThrow(RangeError);
    expect(() => result.current.save({ ...CARD, existing: null, terms: { ...terms, floor: null } })).toThrow(RangeError);
    expect(fake.calls).toHaveLength(0);
  });

  it('a partial set is allowed when the card is paid in full monthly', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(debt({ id: 'id-1', paid_in_full: true })));
    const { result } = await renderHook(() => useSaveCardTerms(), { wrapper: wrapper(qc) });

    result.current.save({
      ...CARD,
      existing: null,
      terms: { percentText: null, interestAdded: null, floor: null, paidInFull: true },
    });
    await waitFor(() => expect(inserts(fake)).toHaveLength(1));
    expect(inserts(fake)[0]!.args[0]).toMatchObject({ paid_in_full: true, min_percent: null });
  });

  it('variables survive a JSON round trip', () => {
    const vars: DebtWriteVars = {
      userId: 'user-1',
      householdId: 'hh-1',
      newId: 'id-1',
      existing: { id: 'd1', version: 2 },
      accountId: 'acc-1',
      accountName: 'Visa',
      currency: 'USD',
      patch: { min_percent: '2', min_floor: null, paid_in_full: false },
    };
    expect(JSON.parse(JSON.stringify(vars))).toEqual(vars);
  });
});

describe('useRecordStatementPeriod', () => {
  it('inserts a period and treats a duplicate id as success', async () => {
    const { fake, qc } = setup();
    fake.respondWith(
      ok({ id: 'id-1', household_id: 'hh-1', account_id: 'acc-1', period_start: '2026-09-01', period_end: '2026-09-30' })
    );
    fake.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    const { result } = await renderHook(() => useRecordStatementPeriod(), { wrapper: wrapper(qc) });

    expect(result.current.record({ householdId: 'hh-1', accountId: 'acc-1', start: '2026-09-01', end: '2026-09-30' })).toBe(true);
    await waitFor(() => expect(inserts(fake)).toHaveLength(1));
    expect(inserts(fake)[0]!.args[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      account_id: 'acc-1',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
    });

    result.current.record({ householdId: 'hh-1', accountId: 'acc-1', start: '2026-09-01', end: '2026-09-30' });
    await waitFor(() => expect(inserts(fake)).toHaveLength(2));
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  it('queues nothing for a period that ends before it starts', async () => {
    const { fake, qc } = setup();
    const { result } = await renderHook(() => useRecordStatementPeriod(), { wrapper: wrapper(qc) });
    expect(result.current.record({ householdId: 'hh-1', accountId: 'acc-1', start: '2026-09-30', end: '2026-09-01' })).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});
