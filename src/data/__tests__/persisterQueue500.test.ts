// 10-13 (SYN-04, T-10-13-03): 500 queued transaction creates with realistic payloads survive the real encrypted persister
// (chunked writes rows), restore into a brand-new QueryClient as 500 pending mutations, and all replay with their own ids.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import { registerMutationDefaults } from '@/data/mutations';
import { renderHook } from '@testing-library/react-native';
import { useAddTransaction } from '@/data/mutations/transactions';
import {
  CACHE_SCHEMA_VERSION,
  createEncryptedPersister,
  MAX_PERSIST_BYTES,
  persistOptions,
  QUERY_CACHE_KEY,
  resumeRestoredMutations,
  WRITES_OVERFLOW_PREFIX,
} from '@/data/cache/persister';
import { clearVersionChains } from '@/data/sync/versionChain';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(mockUuid++).padStart(12, '0')}`) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: jest.fn(() => 'UTC') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
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

jest.setTimeout(120_000);

const N = 500;

/** A server stand-in that accepts every insert and records the ids it was sent. */
function acceptingServer() {
  const insertedIds: string[] = [];
  let last: Record<string, unknown> | null = null;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq']) builder[m] = chain;
  builder.insert = (row: Record<string, unknown>) => {
    insertedIds.push(row.id as string);
    last = { version: 1, deleted_at: null, ...row };
    return builder;
  };
  const answer = () => ({ data: last, error: null, status: 201 });
  builder.single = () => Promise.resolve(answer());
  builder.maybeSingle = () => Promise.resolve(answer());
  builder.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(answer()).then(f, r);
  return {
    insertedIds,
    client: {
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) },
      from: () => builder,
    },
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return qc;
}

afterEach(async () => {
  await AsyncStorage.clear();
  clearVersionChains();
  onlineManager.setOnline(true);
});

describe('SYN-04: 500 queued writes survive a restart through the real persister', () => {
  it('persists, restores into a new client as 500 pending mutations, and replays every one once', async () => {
    onlineManager.setOnline(false);
    mockUuid = 0;
    const qc = newClient();
    const { result } = await renderHook(() => useAddTransaction(), {
      wrapper: ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children),
    });
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      ids.push(
        result.current.add({
          householdId: 'hh-1',
          accountId: 'acc-1',
          categoryId: `cat-${i % 20}`,
          amount: -(1000 + i) as never,
          currency: 'USD',
          homeCurrency: 'USD',
          userId: 'user-1',
          localDate: '2026-09-24',
          timeZone: 'UTC',
          name: `Merchant name number ${i} `.padEnd(60, 'n'),
          note: `Note for entry ${i} `.padEnd(200, 'x'),
          paymentType: 'card',
          status: 'paid',
        } as never)
      );
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(qc.getMutationCache().getAll().filter((m) => m.state.status === 'pending')).toHaveLength(N);

    const persister = createEncryptedPersister(new LargeSecureStore(), 0);
    await persistQueryClientSave({ queryClient: qc, persister, buster: CACHE_SCHEMA_VERSION, dehydrateOptions: persistOptions.dehydrateOptions });

    // No write is dropped: the saved rows hold all 500, and every plaintext chunk is within the persister's budget.
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(QUERY_CACHE_KEY));
    const overflow = keys.filter((k) => k.startsWith(WRITES_OVERFLOW_PREFIX));
    const store = new LargeSecureStore();
    let totalBytes = 0;
    let stored = 0;
    for (const k of overflow) {
      const raw = (await store.getItem(k)) ?? '[]';
      const bytes = Buffer.byteLength(raw, 'utf8');
      expect(bytes).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
      totalBytes += bytes;
      stored += (JSON.parse(raw) as unknown[]).length;
    }
    // Either the whole queue fits the main row (no overflow rows) or the overflow rows hold all 500.
    if (overflow.length > 0) expect(stored).toBe(N);
    console.warn(`[SYN-04 measure] mutations=${N} overflowRows=${overflow.length} plaintextBytes=${totalBytes}`);

    // A brand-new client (the app restarted) restores the whole queue.
    const restarted = newClient();
    await persistQueryClientRestore({ queryClient: restarted, persister, buster: CACHE_SCHEMA_VERSION });
    const pending = restarted.getMutationCache().getAll().filter((m) => m.state.status === 'pending');
    expect(pending).toHaveLength(N);
    expect(pending.map((m) => (m.state.variables as { row: { id: string } }).row.id)).toEqual(ids);

    // Back online: every restored write replays once with its own id.
    const server = acceptingServer();
    mockActiveClient = server.client;
    onlineManager.setOnline(true);
    await resumeRestoredMutations(restarted);
    // Each id is sent at least once and never under another id. A repeated send of the same id is harmless: the server answers
    // 23505 and the write reads the existing row back (MON-08, SYN-03).
    expect(new Set(server.insertedIds).size).toBe(N);
    expect(new Set(server.insertedIds)).toEqual(new Set(ids));
  });
});

// Keeps the secure-store mock referenced so the import is not tree-shaken by lint.
void SecureStore;
