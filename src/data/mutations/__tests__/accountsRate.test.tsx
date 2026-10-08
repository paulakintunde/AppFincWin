// 02-47 Task 1: a foreign-currency account asks for its opening date's rate; failures persist.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { createSweepBudget } from '@/data/sync/sweepBudget';
import { resetResolveRateBackoffForTests, noteResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import { wipeDeviceData } from '@/services/storage/wipe';
import { registerAccountMutations, useAddAccount } from '../accounts';
import {
  ACCOUNT_RATE_CHECKS_KEY,
  retryAccountRateChecks,
  runAccountRateCheck,
  type AccountRateCheck,
} from '../accountRateChecks';
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
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

type Fake = FakeSupabase & DbClient;
const invokes = (fake: Fake) => fake.calls.filter((c) => c.method === 'functions.invoke');
const bodyOf = (c: { args: unknown[] }) => (c.args[1] as { body: unknown }).body;

const accountRow = (currency: string) => ({
  id: 'id-1',
  household_id: 'h1',
  created_by: null,
  name: 'Trip',
  kind: 'checking',
  currency,
  opening_balance: 0,
  archived_at: null,
  updated_by: null,
  overdraft_limit: null,
  credit_limit: null,
  version: 1,
  created_at: 't',
  updated_at: 't',
});

const check = (over: Partial<AccountRateCheck> = {}): AccountRateCheck => ({
  userId: 'u1',
  accountId: 'a1',
  currency: 'GBP',
  homeCurrency: 'USD',
  openingDate: '2026-10-07',
  ...over,
});

const stored = async (): Promise<AccountRateCheck[]> =>
  JSON.parse((await AsyncStorage.getItem(ACCOUNT_RATE_CHECKS_KEY)) ?? '[]') as AccountRateCheck[];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerAccountMutations(qc);
  const fake = createFakeSupabase() as Fake;
  mockActiveClient = fake;
  return { qc, fake };
}

const wrap = (qc: QueryClient) =>
  function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

beforeEach(async () => {
  mockUuid = 0;
  resetResolveRateBackoffForTests();
  await AsyncStorage.clear();
});

describe('useAddAccount rate check', () => {
  const rateCheck = { homeCurrency: 'USD', openingDate: '2026-10-07', userId: 'u1' };
  const input = (currency: string) => ({
    household_id: 'h1',
    name: 'Trip',
    kind: 'checking' as const,
    currency,
    opening_balance: 0,
  });

  it('foreign account asks for its opening date once, then invalidates fxLatest', async () => {
    const { qc, fake } = setup();
    fake.respondWith({ data: accountRow('GBP'), error: null, status: 201 });
    fake.respondWith({ data: { stored: ['GBP', 'USD'] }, error: null, status: 200 });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrap(qc) });
    result.current.add(input('GBP'), undefined, rateCheck);
    await waitFor(() => expect(invokes(fake)).toHaveLength(1));
    expect(bodyOf(invokes(fake)[0]!)).toEqual({ ensure: { date: '2026-10-07', currencies: ['GBP', 'USD'] } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.fxLatest() }));
    expect(await stored()).toEqual([]);
  });

  it('home-currency account or absent rateCheck makes no call', async () => {
    const { qc, fake } = setup();
    fake.respondWith({ data: accountRow('USD'), error: null, status: 201 });
    fake.respondWith({ data: accountRow('GBP'), error: null, status: 201 });
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrap(qc) });
    result.current.add(input('USD'), undefined, rateCheck);
    result.current.add(input('GBP'));
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'insert')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(invokes(fake)).toHaveLength(0);
  });

  it('a rejected insert makes no call', async () => {
    const { qc, fake } = setup();
    fake.respondWith({ data: null, error: { message: 'nope', code: '42501' }, status: 403 });
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrap(qc) });
    result.current.add(input('GBP'), undefined, rateCheck);
    await new Promise((r) => setTimeout(r, 50));
    expect(invokes(fake)).toHaveLength(0);
  });

  it('a failed check is persisted and the account write still succeeds', async () => {
    const { qc, fake } = setup();
    fake.respondWith({ data: accountRow('GBP'), error: null, status: 201 });
    fake.respondWith({ data: null, error: { message: 'x' }, status: 502 });
    const { result } = await renderHook(() => useAddAccount(), { wrapper: wrap(qc) });
    result.current.add(input('GBP'), undefined, rateCheck);
    await waitFor(async () => expect((await stored()).length).toBe(1));
    expect((await stored())[0]).toEqual({ ...rateCheck, accountId: 'id-1', currency: 'GBP' });
  });
});

describe('runAccountRateCheck / retryAccountRateChecks', () => {
  it('throttled -> deferred and persisted without a call', async () => {
    const { qc, fake } = setup();
    noteResolveRateThrottled();
    expect(await runAccountRateCheck(qc, check())).toBe('deferred');
    expect(invokes(fake)).toHaveLength(0);
    expect(await stored()).toHaveLength(1);
  });

  it('a thrown call is deferred, never rethrown', async () => {
    const { qc, fake } = setup();
    jest.spyOn(fake.functions, 'invoke').mockRejectedValue(new Error('boom'));
    expect(await runAccountRateCheck(qc, check())).toBe('deferred');
    expect(await stored()).toHaveLength(1);
  });

  it('caps the list at 20, oldest dropped', async () => {
    const { qc } = setup();
    noteResolveRateThrottled();
    for (let i = 0; i < 22; i++) await runAccountRateCheck(qc, check({ accountId: `a${i}` }));
    const list = await stored();
    expect(list).toHaveLength(20);
    expect(list[0]!.accountId).toBe('a2');
    expect(list[19]!.accountId).toBe('a21');
  });

  it('retry: removes done, keeps deferred, drops other users without a call, stops at budget', async () => {
    const { qc, fake } = setup();
    await AsyncStorage.setItem(
      ACCOUNT_RATE_CHECKS_KEY,
      JSON.stringify([
        check({ accountId: 'other', userId: 'u2' }),
        check({ accountId: 'ok' }),
        check({ accountId: 'bad' }),
        check({ accountId: 'unreached' }),
      ])
    );
    fake.respondWith({ data: { stored: ['GBP'] }, error: null, status: 200 });
    fake.respondWith({ data: null, error: { message: 'x' }, status: 502 });
    const budget = createSweepBudget(2);
    await retryAccountRateChecks(qc, 'u1', budget);
    expect(invokes(fake)).toHaveLength(2);
    expect(budget.remaining).toBe(0);
    expect((await stored()).map((c) => c.accountId)).toEqual(['bad', 'unreached']);
  });

  it('wipeDeviceData removes the key', async () => {
    await AsyncStorage.setItem(ACCOUNT_RATE_CHECKS_KEY, '[]');
    await wipeDeviceData();
    expect(await AsyncStorage.getItem(ACCOUNT_RATE_CHECKS_KEY)).toBeNull();
  });
});
