// 06.1-13 (APP-29): running costs become bills one tap at a time; nothing is batched.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { RunningCostLine } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money/types';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { registerSeriesMutations } from '../recurringSeries';
import { runningCostBillOf, useAddRunningCostBill, type RunningCostBillContext } from '../runningCostBills';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockN = 0;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${++mockN}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

jest.setTimeout(60000);
const line = (over: Partial<RunningCostLine> = {}): RunningCostLine => ({
  id: 'l1', amount: minorUnits(12000), everyMonths: 3, start: '2026-11-01', end: null, on: true, ...over,
});
const ctx: RunningCostBillContext = {
  householdId: 'h1', accountId: 'acc1', currency: 'USD', timeZone: 'UTC', label: 'insurance', mint: () => `s-${++mockN}`,
};

beforeEach(() => {
  mockN = 0;
  onlineManager.setOnline(true);
});

describe('runningCostBillOf', () => {
  it('maps a line to an expense series on its own dates and cadence', () => {
    expect(runningCostBillOf(line(), 'Used car', 'cat1', ctx)).toMatchObject({
      name: 'Used car insurance', amount: -12000, freq: 'quarterly', anchor_date: '2026-11-01', end_date: null,
      category_id: 'cat1', account_id: 'acc1', occurrence_count: null,
    });
    expect(runningCostBillOf(line({ everyMonths: 1, end: '2027-05-01' }), 'Car', null, ctx)).toMatchObject({ freq: 'monthly', end_date: '2027-05-01' });
    expect(runningCostBillOf(line({ everyMonths: 12 }), 'Car', null, ctx)?.freq).toBe('yearly');
  });

  it('never offers a line that is switched off', () => {
    expect(runningCostBillOf(line({ on: false }), 'Car', null, ctx)).toBeNull();
  });
});

describe('useAddRunningCostBill', () => {
  it('adds one series per call with its own undo step, and nothing for an off line', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { id: 'x', version: 1 }, error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    registerSeriesMutations(qc);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useAddRunningCostBill(), { wrapper });

    expect(result.current.add({ line: line({ on: false }), itemName: 'Car', categoryId: null, ownerId: 'u1', ctx })).toBeNull();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);

    const a = result.current.add({ line: line(), itemName: 'Car', categoryId: null, ownerId: 'u1', ctx });
    expect(a).toEqual(expect.any(String));
    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(1));
    const vars = qc.getMutationCache().getAll()[0]!.state.variables as { series: { name: string }; undo: { id: string } };
    expect(vars.series.name).toBe('Car insurance');
    expect(vars.undo.id).toBe(a);
  });
});
