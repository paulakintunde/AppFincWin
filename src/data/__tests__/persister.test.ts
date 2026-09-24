// SYN-01/SYN-07/D-15: proves the persisted query cache is ciphertext-only on disk, its key
// lives in SecureStore, it round-trips through a restore, a buster mismatch discards it, data
// stale for 30+ days is never persisted, and the registered wipe handler clears it all.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import {
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  createEncryptedPersister,
  persistOptions,
  QUERY_CACHE_KEY,
} from '../cache/persister';
import { queryClient } from '../queryClient';
import { wipeDeviceData } from '@/services/storage/wipe';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

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

const TX_KEY = ['transactions', 'h1', '2026-09'];
const TX_DATA = [{ id: 't1', note: 'Groceries at Market', original_amount: 1234 }];

async function saveWith(client: QueryClient, buster = CACHE_SCHEMA_VERSION) {
  await persistQueryClientSave({
    queryClient: client,
    persister: createEncryptedPersister(),
    dehydrateOptions: persistOptions.dehydrateOptions,
    buster,
  });
}

describe('encrypted query cache persister', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    secureStoreMap().clear();
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('persists ciphertext only at the query-cache key, never the plaintext payload', async () => {
    const client = new QueryClient();
    client.setQueryData(TX_KEY, TX_DATA);

    await saveWith(client);

    const raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/i);
    expect(raw).not.toContain('Groceries');
    expect(raw).not.toContain('1234');
    expect(raw).not.toContain('t1');
  });

  it('stores the encryption key in SecureStore under a .k-suffixed name, WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    const client = new QueryClient();
    client.setQueryData(TX_KEY, TX_DATA);

    await saveWith(client);

    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    const [keyName, keyValue, options] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
    expect(keyName).toMatch(/\.k$/);
    expect(keyValue).not.toContain('Groceries');
    expect(options).toEqual({ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  });

  it('round-trips into a fresh QueryClient on restore', async () => {
    const client = new QueryClient();
    client.setQueryData(TX_KEY, TX_DATA);
    await saveWith(client);

    const fresh = new QueryClient();
    await persistQueryClientRestore({
      queryClient: fresh,
      persister: createEncryptedPersister(),
      maxAge: CACHE_MAX_AGE_MS,
      buster: CACHE_SCHEMA_VERSION,
    });

    expect(fresh.getQueryData(TX_KEY)).toEqual(TX_DATA);
  });

  it('restores nothing when the buster does not match', async () => {
    const client = new QueryClient();
    client.setQueryData(TX_KEY, TX_DATA);
    await saveWith(client);

    const fresh = new QueryClient();
    await persistQueryClientRestore({
      queryClient: fresh,
      persister: createEncryptedPersister(),
      maxAge: CACHE_MAX_AGE_MS,
      buster: '2',
    });

    expect(fresh.getQueryData(TX_KEY)).toBeUndefined();
  });

  it('does not persist a query whose data has not refreshed successfully in 30 days (D-15)', async () => {
    const client = new QueryClient();
    const staleKey = ['accounts', 'h1'];
    client.setQueryData(staleKey, [{ id: 'a1' }], { updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
    client.setQueryData(TX_KEY, TX_DATA);
    await saveWith(client);

    const fresh = new QueryClient();
    await persistQueryClientRestore({
      queryClient: fresh,
      persister: createEncryptedPersister(),
      maxAge: CACHE_MAX_AGE_MS,
      buster: CACHE_SCHEMA_VERSION,
    });

    expect(fresh.getQueryData(staleKey)).toBeUndefined();
    expect(fresh.getQueryData(TX_KEY)).toEqual(TX_DATA);
  });

  it('the registered wipe handler removes the persisted blob and clears the in-memory cache', async () => {
    queryClient.setQueryData(TX_KEY, TX_DATA);
    await saveWith(queryClient);
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).not.toBeNull();

    await wipeDeviceData();

    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
