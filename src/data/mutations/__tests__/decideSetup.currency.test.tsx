// CR-03 write side and IN-02: settings money saves are stamped with the confirmed home currency; an unchanged
// month_marks in another key order is no change.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, MoneyPrefsRow } from '@/db/rows';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { DEFAULT_MONEY_PREFS } from '@/data/queries/moneyPrefs';
import { changedSettingsKeys, registerDecideSetupMutations, useSaveSetupStep, useSaveUnexplainedAnswer } from '../decideSetup';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

let seq = 0;
let USER = 'cur-0';
let KEY = queryKeys.decideSettings(USER);

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(home: string | null): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  seq += 1;
  USER = `cur-${seq}`;
  KEY = queryKeys.decideSettings(USER);
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideSetupMutations(qc);
  if (home !== null) qc.setQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs(USER), { ...DEFAULT_MONEY_PREFS, home_currency: home });
  return { fake, qc };
}

const row = (overrides: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({
  ...EMPTY_DECIDE_SETTINGS,
  id: 'set-1',
  user_id: USER,
  version: 1,
  ...overrides,
});
const ok = (data: unknown) => ({ data, error: null, status: 200 });
const undoInsert = (fake: FakeSupabase) => fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');
const upsertArg = (fake: FakeSupabase) => fake.calls.find((c) => c.method === 'upsert')?.args[0];

beforeEach(() => onlineManager.setOnline(true));

describe('home-currency stamp on settings money', () => {
  it('no settings row yet: the first money save stamps the home currency', async () => {
    const { fake, qc } = setup('GBP');
    fake.respondWith(ok(row({ everyday_override: 200000, currency: 'GBP', version: 1 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { everyday_override: 200000 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toEqual({ user_id: USER, everyday_override: 200000, currency: 'GBP' });
  });

  it('stored GBP, home now JPY: stamps JPY, clears the other money columns, and Undo carries their old values', async () => {
    const { fake, qc } = setup('JPY');
    qc.setQueryData(KEY, row({ currency: 'GBP', everyday_override: 200000, steady_amount: 300000, unspent_anchor: 5000 }));
    fake.respondWith(ok(row({ currency: 'JPY', everyday_override: 150, steady_amount: null, unspent_anchor: null, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { everyday_override: 150 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toMatchObject({ everyday_override: 150, currency: 'JPY', steady_amount: null, unspent_anchor: null });
    const payload = undoInsert(fake)?.args[0] as { ops: { patch: Record<string, unknown> }[] };
    expect(payload.ops[0]?.patch).toMatchObject({ currency: 'GBP', everyday_override: 200000, steady_amount: 300000, unspent_anchor: 5000 });
  });

  it('stored GBP, home GBP: stamps GBP and clears nothing', async () => {
    const { fake, qc } = setup('GBP');
    qc.setQueryData(KEY, row({ currency: 'GBP', steady_amount: 300000 }));
    fake.respondWith(ok(row({ currency: 'GBP', steady_amount: 300000, everyday_override: 100, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { everyday_override: 100 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const sent = upsertArg(fake) as Record<string, unknown>;
    expect(sent).toMatchObject({ everyday_override: 100, currency: 'GBP' });
    expect(sent).not.toHaveProperty('steady_amount');
  });

  it('no money-prefs row in the cache: falls back to the stored currency, never a placeholder', async () => {
    const { fake, qc } = setup(null);
    qc.setQueryData(KEY, row({ currency: 'EUR' }));
    fake.respondWith(ok(row({ currency: 'EUR', everyday_override: 100, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { everyday_override: 100 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toMatchObject({ currency: 'EUR' });
  });

  it('no money-prefs row and no stored currency: stamps nothing', async () => {
    const { fake, qc } = setup(null);
    fake.respondWith(ok(row({ everyday_override: 100 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { everyday_override: 100 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toEqual({ user_id: USER, everyday_override: 100 });
  });

  it('a patch with no money column adds no currency', async () => {
    const { fake, qc } = setup('GBP');
    fake.respondWith(ok(row({ detail: 'short' })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { detail: 'short' } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toEqual({ user_id: USER, detail: 'short' });
  });

  it('the unexplained answer stamps home the same way', async () => {
    const { fake, qc } = setup('GBP');
    fake.respondWith(ok(row({ unexplained_amount: 10000, currency: 'GBP' })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveUnexplainedAnswer(USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 10000, use: 'spare', at: '2026-10-02' });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(upsertArg(fake)).toMatchObject({ unexplained_amount: 10000, currency: 'GBP' });
  });
});

describe('IN-02: month_marks compare by value', () => {
  it('the same marks in another key order are unchanged: no write, no version bump', async () => {
    const { fake, qc } = setup('GBP');
    const current = row({ month_marks: { b: 'half', a: 'out' } });
    qc.setQueryData(KEY, current);
    expect(changedSettingsKeys({ month_marks: { a: 'out', b: 'half' } }, current)).toEqual([]);
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ patch: { month_marks: { a: 'out', b: 'half' } } })).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('nested objects compare by value, arrays keep their order, differences still count', () => {
    const cur = row({ month_marks: { x: { p: 1, q: [1, 2] } } as never });
    expect(changedSettingsKeys({ month_marks: { x: { q: [1, 2], p: 1 } } }, cur)).toEqual([]);
    expect(changedSettingsKeys({ month_marks: { x: { q: [2, 1], p: 1 } } }, cur)).toEqual(['month_marks']);
    expect(changedSettingsKeys({ month_marks: { x: { q: [1, 2] } } }, cur)).toEqual(['month_marks']);
    expect(changedSettingsKeys({ month_marks: { x: { p: 1, q: [1, 2], r: 3 } } }, cur)).toEqual(['month_marks']);
  });
});
