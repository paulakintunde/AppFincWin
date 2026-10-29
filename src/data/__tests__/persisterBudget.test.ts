// F-11: the persisted query cache must never be written as a row too big for Android's 2 MB
// CursorWindow, and queued offline writes must never be dropped or lost (SYN-02).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { addBreadcrumb } from '@sentry/react-native';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import {
  clearServerFetchTimes,
  createEncryptedPersister,
  deserializeWithFetchTimes,
  fitToBudget,
  isNeverPersisted,
  MAX_PERSIST_BYTES,
  persistOptions,
  QUERY_CACHE_KEY,
  serializeWithFetchTimes,
  WRITES_OVERFLOW_PREFIX,
} from '../cache/persister';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

const secureStoreMap = () => (SecureStore as unknown as { __store: Map<string, string> }).__store;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

type DQuery = PersistedClient['clientState']['queries'][number];
type DMutation = PersistedClient['clientState']['mutations'][number];

function txRow(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    household_id: 'hh-1',
    account_id: `acc-${i % 13}`,
    category_id: `cat-${i % 20}`,
    kind: 'expense',
    original_amount: 1000 + i,
    original_currency: 'CAD',
    amount_minor: 1000 + i,
    note: `Purchase number ${i}`,
    occurred_on: '2026-09-15',
    created_at: '2026-09-15T12:00:00.000Z',
    updated_at: '2026-09-15T12:00:00.000Z',
    created_by: 'user-1',
    transfer_group_id: null,
    import_batch_id: null,
    import_hash: null,
  };
}

function query(key: readonly unknown[], data: unknown): DQuery {
  return {
    queryKey: key,
    queryHash: JSON.stringify(key),
    state: { data, status: 'success', dataUpdatedAt: Date.now() },
  } as unknown as DQuery;
}

function mutation(i: number, pad = 400): DMutation {
  return {
    mutationKey: ['transactions', 'add'],
    state: { status: 'pending', isPaused: true, variables: { row: { id: `m-${i}`, note: `queued-${i}-${'q'.repeat(pad)}` } } },
  } as unknown as DMutation;
}

function client(queries: DQuery[], mutations: DMutation[]): PersistedClient {
  return { timestamp: Date.now(), buster: '2', clientState: { queries, mutations } };
}

function fakeQuery(key: readonly unknown[]): Query {
  return { queryKey: key, queryHash: JSON.stringify(key), state: { status: 'success', dataUpdatedAt: Date.now() } } as unknown as Query;
}

describe('F-11 persisted cache budget', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    secureStoreMap().clear();
    clearServerFetchTimes();
    jest.clearAllMocks();
  });

  it('large household: 13 accounts, about 9,000 transactions stay under budget after the guard', () => {
    const rows = Array.from({ length: 9000 }, (_, i) => txRow(i));
    const queries = [
      query(['transactions', 'hh-1', '2026-09'], rows.slice(0, 3000)),
      query(['transactions', 'hh-1', '2026-08'], rows.slice(3000, 6000)),
      query(['transactions', 'hh-1', 'decide-history', '2026-04-01', '2026-09-30'], rows.slice(0, 1500)),
      query(['transactions', 'hh-1', 'offer-history', '2026-04-01', '2026-09-30'], rows),
      query(['transactions', 'hh-1', 'refund-links'], rows.slice(0, 500)),
      query(['accounts', 'hh-1'], Array.from({ length: 13 }, (_, i) => ({ id: `acc-${i}`, name: `Account ${i}` }))),
    ];
    const c = client(queries, []);
    const before = bytes(JSON.stringify(c));
    const filtered = queries.filter((q) => !isNeverPersisted(q.queryKey));
    const afterFilter = bytes(JSON.stringify(client(filtered, [])));
    const after = bytes(serializeWithFetchTimes(client(filtered, [])));
    // Recorded in the SUMMARY.
    console.warn(`[F-11 measure] raw=${before} afterFilter=${afterFilter} guarded=${after} budget=${MAX_PERSIST_BYTES}`);
    expect(before).toBeGreaterThan(MAX_PERSIST_BYTES);
    expect(after).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
  });

  it('shouldDehydrateQuery excludes the heavy re-fetchable reads and keeps month and decide-history', () => {
    const f = persistOptions.dehydrateOptions!.shouldDehydrateQuery!;
    expect(f(fakeQuery(['transactions', 'h', 'offer-history', 'a', 'b']))).toBe(false);
    expect(f(fakeQuery(['transactions', 'h', 'search', 'term']))).toBe(false);
    expect(f(fakeQuery(['transactions', 'h', 'refund-links']))).toBe(false);
    expect(f(fakeQuery(['transactions', 'h', 'refund-purchases', 'x,y']))).toBe(false);
    expect(f(fakeQuery(['transactions', 'h', '2026-09']))).toBe(true);
    expect(f(fakeQuery(['transactions', 'h', 'decide-history', 'a', 'b']))).toBe(true);
  });

  it('fitToBudget leaves a small client unchanged', () => {
    const c = client([query(['a'], [1, 2, 3])], [mutation(1)]);
    expect(fitToBudget(c, 100_000)).toBe(c);
  });

  it('fitToBudget drops the largest queries first and never the mutations', () => {
    const big = query(['big'], 'x'.repeat(5000));
    const mid = query(['mid'], 'x'.repeat(2000));
    const small = query(['small'], 'x'.repeat(100));
    const muts = [mutation(1), mutation(2)];
    const c = client([small, big, mid], muts);
    const limit = bytes(JSON.stringify(c)) - 4000;
    const fit = fitToBudget(c, limit);
    expect(fit.clientState.queries.map((q) => q.queryKey[0])).toEqual(['small', 'mid']);
    expect(fit.clientState.mutations).toEqual(muts);
  });

  it('fitToBudget keeps every mutation even when they alone exceed the budget', () => {
    const muts = Array.from({ length: 50 }, (_, i) => mutation(i));
    const fit = fitToBudget(client([query(['a'], 'x'.repeat(1000))], muts), 500);
    expect(fit.clientState.queries).toHaveLength(0);
    expect(fit.clientState.mutations).toHaveLength(50);
  });

  it('round trip restores kept queries and all mutations', () => {
    const muts = [mutation(1), mutation(2)];
    const c = client([query(['a'], [1]), query(['b'], [2])], muts);
    const back = deserializeWithFetchTimes(serializeWithFetchTimes(c));
    expect(back.clientState.queries).toHaveLength(2);
    expect(back.clientState.mutations).toEqual(muts);
  });

  describe('queued writes larger than the budget', () => {
    async function rawRows(): Promise<Record<string, string>> {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(QUERY_CACHE_KEY));
      const out: Record<string, string> = {};
      for (const k of keys) out[k] = (await AsyncStorage.getItem(k)) ?? '';
      return out;
    }

    async function persistNow(c: PersistedClient) {
      const p = createEncryptedPersister(new LargeSecureStore(), 0);
      await p.persistClient(c);
      // The base persister may flush on a later tick: wait for the main row.
      for (let i = 0; i < 50 && (await AsyncStorage.getItem(QUERY_CACHE_KEY)) === null; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return p;
    }

    it('stores 400 mutations (~2.5x budget) in overflow rows under budget and restores them in order', async () => {
      const muts = Array.from({ length: 400 }, (_, i) => mutation(i, 6000));
      const total = bytes(JSON.stringify(muts));
      expect(total).toBeGreaterThan(2.4 * MAX_PERSIST_BYTES);
      const p = await persistNow(client(Array.from({ length: 50 }, (_, i) => query(['q', i], [i])), muts));

      const rows = await rawRows();
      const overflow = Object.keys(rows).filter((k) => k.startsWith(WRITES_OVERFLOW_PREFIX));
      expect(overflow.length).toBeGreaterThanOrEqual(Math.ceil(total / MAX_PERSIST_BYTES));
      expect(overflow.length).toBeGreaterThanOrEqual(3);
      // Hex ciphertext is about 2x the plaintext: every plaintext chunk is under budget, so every row is under 2 MB.
      for (const k of Object.keys(rows)) expect(rows[k]!.length).toBeLessThan(2 * 1024 * 1024);
      const store = new LargeSecureStore();
      for (const k of overflow) expect(bytes((await store.getItem(k)) ?? '')).toBeLessThanOrEqual(MAX_PERSIST_BYTES);

      const restored = await p.restoreClient();
      expect(restored?.clientState.queries).toHaveLength(0);
      const ids = (restored?.clientState.mutations ?? []).map(
        (m) => (m.state.variables as { row: { id: string } }).row.id
      );
      expect(ids).toEqual(Array.from({ length: 400 }, (_, i) => `m-${i}`));
    });

    it('records one numeric-only breadcrumb with no payload strings', async () => {
      const muts = Array.from({ length: 400 }, (_, i) => mutation(i, 6000));
      await persistNow(client([], muts));
      expect(addBreadcrumb).toHaveBeenCalledTimes(1);
      const crumb = (addBreadcrumb as jest.Mock).mock.calls[0][0] as {
        category: string;
        message: string;
        data: Record<string, unknown>;
      };
      expect(crumb.category).toBe('persist');
      expect(crumb.message).toBe('queued writes over budget');
      expect(crumb.data.mutations).toBe(400);
      for (const v of Object.values(crumb.data)) expect(typeof v).toBe('number');
      expect(JSON.stringify(crumb)).not.toContain('queued-');
    });

    it('under budget: no overflow rows, and stale ones from an earlier persist are removed', async () => {
      const store = new LargeSecureStore();
      await store.setItem(WRITES_OVERFLOW_PREFIX + '0', '[]');
      await store.setItem(WRITES_OVERFLOW_PREFIX + '1', '[]');
      await persistNow(client([query(['a'], [1])], [mutation(1)]));
      const rows = await rawRows();
      expect(Object.keys(rows).filter((k) => k.startsWith(WRITES_OVERFLOW_PREFIX))).toHaveLength(0);
      expect(addBreadcrumb).not.toHaveBeenCalled();
    });

    it('removeClient removes the overflow rows too', async () => {
      const muts = Array.from({ length: 400 }, (_, i) => mutation(i, 6000));
      const p = await persistNow(client([], muts));
      await p.removeClient();
      expect(Object.keys(await rawRows())).toHaveLength(0);
    });
  });

  describe('dev log', () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const original = g.__DEV__;
    afterEach(() => {
      g.__DEV__ = original;
    });

    it('prints numbers only when __DEV__ is true, and nothing when false', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      g.__DEV__ = true;
      const p = createEncryptedPersister(new LargeSecureStore(), 0);
      await p.persistClient(client([query(['a'], 'secret-name')], [mutation(1)]));
      const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[persist]'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[persist\] bytes=\d+ queries=1 mutations=1$/);

      log.mockClear();
      g.__DEV__ = false;
      await p.persistClient(client([query(['a'], 'x')], []));
      expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[persist]'))).toHaveLength(0);
      log.mockRestore();
    });
  });
});
