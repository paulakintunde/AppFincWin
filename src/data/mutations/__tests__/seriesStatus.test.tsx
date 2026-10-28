// 05.2-44: Stopped / Paused / Resume. Each action is exactly one edit_recurring_series_from call
// carrying end_date and end_reason together plus the server-built undo step label.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, RecurringSeriesRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { addDays } from '@/engine/decide/v3/dates';
import { localDateIn } from '@/engine/time';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerSeriesMutations, useEndSeries, useSetSeriesStatus } from '../recurringSeries';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `step-${++mockUuid}`) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: jest.fn(() => 'UTC') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));
jest.mock('@/db/patches', () => ({ applyPatches: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { insertUndoStep } = require('@/db/undoLog') as { insertUndoStep: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyPatches } = require('@/db/patches') as { applyPatches: jest.Mock };

const wrapper = (qc: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerSeriesMutations(qc);
  return qc;
}

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const applied = ok({
  status: 'applied',
  series: { id: 's1', version: 4, before: null },
  inserted: [],
  soft_deleted: [],
  linked: [],
  undo_step_id: 'step',
});

const today = localDateIn(new Date(), 'UTC');
const series = (over: Partial<RecurringSeriesRow> = {}) =>
  ({
    id: 's1',
    household_id: 'h1',
    name: 'Rent',
    version: 3,
    anchor_date: '2020-01-01',
    end_date: null,
    end_reason: null,
    ...over,
  }) as Pick<RecurringSeriesRow, 'id' | 'household_id' | 'name' | 'version' | 'anchor_date' | 'end_date' | 'end_reason'>;

function rpcCalls(fake: FakeSupabase): { name: string; args: Record<string, unknown> }[] {
  return fake.calls
    .filter((c) => c.method === 'rpc')
    .map((c) => ({ name: c.args[0] as string, args: c.args[1] as Record<string, unknown> }));
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  insertUndoStep.mockClear();
  applyPatches.mockClear();
});

async function setup(response: unknown = applied) {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  fake.respondWith(response as never);
  const qc = newClient();
  const { result } = await renderHook(() => useSetSeriesStatus(), { wrapper: wrapper(qc) });
  return { fake, result };
}

describe('useSetSeriesStatus', () => {
  it('stop: one call, end_date the day before with end_reason stopped', async () => {
    const { fake, result } = await setup();
    const from = addDays(today, 5);
    const id = result.current.stop(series(), from, 'u1');
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    const [call] = rpcCalls(fake);
    expect(call!.name).toBe('edit_recurring_series_from');
    expect(call!.args).toMatchObject({
      p_series_id: 's1',
      p_expected_version: 3,
      p_patch: { end_date: addDays(from, -1), end_reason: 'stopped' },
      p_effective_from: from,
      p_undo_step: { id, label_key: 'seriesStopped', label_params: { name: 'Rent' } },
    });
    expect(id).toBe('step-1');
    expect(insertUndoStep).not.toHaveBeenCalled();
    expect(applyPatches).not.toHaveBeenCalled();
  });

  it('pause: end_reason paused with the seriesPaused label', async () => {
    const { fake, result } = await setup();
    const from = addDays(today, 1);
    result.current.pause(series(), from, 'u1');
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]!.args).toMatchObject({
      p_patch: { end_date: today, end_reason: 'paused' },
      p_effective_from: from,
      p_undo_step: { label_key: 'seriesPaused', label_params: { name: 'Rent' } },
    });
  });

  it('resume (in place): re-anchors, clears end_date and end_reason in the one call', async () => {
    const { fake, result } = await setup();
    const on = addDays(today, 10);
    result.current.resume(series({ end_date: today, end_reason: 'paused' }), on, 'u1');
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    const [call] = rpcCalls(fake);
    expect(call!.args).toMatchObject({
      p_patch: { anchor_date: on, end_date: null, end_reason: null },
      p_effective_from: on,
      p_undo_step: { label_key: 'seriesResumed', label_params: { name: 'Rent' } },
    });
    expect(rpcCalls(fake)).toHaveLength(1);
    expect(applyPatches).not.toHaveBeenCalled();
    expect(insertUndoStep).not.toHaveBeenCalled();
  });

  it('treats already-applied (a replay with the same step id) as success', async () => {
    const { fake, result } = await setup(ok({ status: 'already-applied' }));
    result.current.stop(series(), addDays(today, 2), 'u1');
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  });

  it('refuses dates the pure rules reject', async () => {
    const { fake, result } = await setup();
    expect(() => result.current.stop(series({ anchor_date: addDays(today, 3) }), addDays(today, 3), 'u1')).toThrow(RangeError);
    expect(() => result.current.pause(series(), '2019-01-01', 'u1')).toThrow(RangeError);
    expect(() => result.current.resume(series(), addDays(today, 3), 'u1')).toThrow(RangeError);
    expect(rpcCalls(fake)).toHaveLength(0);
  });
});

describe('plain ends read as Stopped', () => {
  it('a row ended through useEndSeries (end_reason null) reads stopped', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied);
    const qc = newClient();
    const { result } = await renderHook(() => useEndSeries(), { wrapper: wrapper(qc) });
    result.current.end({ id: 's1', householdId: 'h1', expectedVersion: 3, endDate: '2026-12-31', ownerId: 'u1', name: 'Rent' });
    await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
    expect(rpcCalls(fake)[0]!.args).not.toHaveProperty('p_patch');
    expect(seriesStatusOf({ end_date: '2026-12-31', end_reason: null })).toEqual({ kind: 'stopped', from: '2027-01-01' });
  });
});
