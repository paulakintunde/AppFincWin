// SYN-01: proves a query restored from the encrypted persisted cache renders its cached data
// while the device is offline, without a network fetch ever having to succeed (or, per the
// plan, without one being attempted at all while offline).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { CACHE_MAX_AGE_MS, CACHE_SCHEMA_VERSION, createEncryptedPersister, persistOptions } from '../cache/persister';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

// Must be stateful across calls (unlike jest-expo's default automock) — LargeSecureStore's
// key-generation cycle (getOrCreateKey) runs once during the save's setItem and again during
// the restore's getItem, and both must resolve the same 256-bit key for decryption to produce
// valid plaintext instead of AES-CTR garbage. Mirrors largeSecureStore.test.ts's mock exactly.
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

const ACCOUNTS_KEY = ['accounts', 'h1'];
const ACCOUNT_DATA = { id: 'acc1', name: 'Everyday' };

// The retry-pause assertion below waits out the retryer's ~1000ms default backoff delay;
// give the whole test more headroom than Jest's 5000ms default.
jest.setTimeout(10000);

describe('offline read from the restored persisted cache', () => {
  afterEach(async () => {
    onlineManager.setOnline(true);
    await AsyncStorage.clear();
    (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  });

  it('renders cached data offline and does not run a successful network fetch', async () => {
    const seedClient = new QueryClient();
    seedClient.setQueryData(ACCOUNTS_KEY, ACCOUNT_DATA);
    await persistQueryClientSave({
      queryClient: seedClient,
      persister: createEncryptedPersister(),
      dehydrateOptions: persistOptions.dehydrateOptions,
      buster: CACHE_SCHEMA_VERSION,
    });

    const freshClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient: freshClient,
      persister: createEncryptedPersister(),
      maxAge: CACHE_MAX_AGE_MS,
      buster: CACHE_SCHEMA_VERSION,
    });

    onlineManager.setOnline(false);

    const queryFn = jest.fn().mockRejectedValue(new Error('network'));
    const { result } = await renderHook(
      () => useQuery({ queryKey: ACCOUNTS_KEY, queryFn, networkMode: 'offlineFirst' }),
      { wrapper: ({ children }) => <QueryClientProvider client={freshClient}>{children}</QueryClientProvider> }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(ACCOUNT_DATA);
    });

    // Verified against @tanstack/query-core's retryer.js: 'offlineFirst' always fires the
    // *first* fetch attempt regardless of online status (only 'online' mode's canStart()
    // short-circuits on onlineManager.isOnline()) — but a failed attempt's *retry* pauses
    // while offline (canContinue() checks isOnline()), after the retry's ~1000ms default
    // backoff delay elapses (the retryer sleeps before checking canContinue()). So queryFn is
    // called exactly once, the query then settles into 'paused' instead of hammering retries
    // against a network that is not there, and the cached data stays visible throughout
    // (SYN-01). timeout is raised past that 1000ms backoff so the assertion doesn't race it.
    await waitFor(
      () => {
        expect(result.current.fetchStatus).toBe('paused');
      },
      { timeout: 3000 }
    );
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(ACCOUNT_DATA);
  });
});
