import React from 'react';
// Same defense-in-depth pattern as largeSecureStore.test.ts / failedWrites.test.ts: LargeSecureStore
// (pulled in transitively via ../failedWrites) needs a real crypto.getRandomValues under Jest.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider, onlineManager, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useSyncStatus } from '../useSyncStatus';
import { recordFailedWrite, dismissFailedWrite, getFailedWrites } from '../failedWrites';
import {
  markSynced,
  getLastSyncedAt,
  hydrateLastSynced,
  subscribeLastSynced,
  trackSyncActivity,
  LAST_SYNCED_KEY,
} from '../lastSynced';
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

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: jest.fn(() => `uuid-${counter++}`) };
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSyncStatus', () => {
  afterEach(async () => {
    onlineManager.setOnline(true);
    for (const entry of getFailedWrites()) {
      await dismissFailedWrite(entry.id);
    }
    await AsyncStorage.removeItem(LAST_SYNCED_KEY);
    jest.clearAllMocks();
  });

  it('reports isOnline from onlineManager, live', async () => {
    const queryClient = new QueryClient();
    const { result } = await renderHook(() => useSyncStatus(), { wrapper: createWrapper(queryClient) });

    expect(result.current.isOnline).toBe(true);

    await act(() => {
      onlineManager.setOnline(false);
    });

    await waitFor(() => expect(result.current.isOnline).toBe(false));
  });

  it('counts paused (offline-queued) mutations as queued', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result: status } = await renderHook(() => useSyncStatus(), { wrapper: createWrapper(queryClient) });

    expect(status.current.queued).toBe(0);

    await act(() => {
      onlineManager.setOnline(false);
    });

    function useTwoMutations() {
      const a = useMutation({ mutationFn: async () => 'a' });
      const b = useMutation({ mutationFn: async () => 'b' });
      return { a, b };
    }
    const { result: mutations } = await renderHook(() => useTwoMutations(), { wrapper: createWrapper(queryClient) });

    await act(() => {
      mutations.current.a.mutate();
      mutations.current.b.mutate();
    });

    await waitFor(() => expect(status.current.queued).toBe(2));
  });

  it('splits failed writes into failed and conflicts by kind (D-18 conflicts are never last-write-wins)', async () => {
    const queryClient = new QueryClient();
    const { result } = await renderHook(() => useSyncStatus(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await recordFailedWrite({
        entity: 'transactions',
        entityId: 'tx-1',
        kind: 'rejected',
        code: '42501',
        attempted: {},
      });
      await recordFailedWrite({
        entity: 'transactions',
        entityId: 'tx-2',
        kind: 'conflict',
        code: 'version-conflict',
        attempted: {},
      });
    });

    await waitFor(() => {
      expect(result.current.failed).toBe(1);
      expect(result.current.conflicts).toBe(1);
    });
  });

  it('reflects markSynced as lastSyncedAt', async () => {
    const queryClient = new QueryClient();
    const { result } = await renderHook(() => useSyncStatus(), { wrapper: createWrapper(queryClient) });

    await act(() => {
      markSynced(1_700_000_000_000);
    });

    await waitFor(() => expect(result.current.lastSyncedAt).toBe(1_700_000_000_000));
  });
});

describe('lastSynced', () => {
  afterEach(async () => {
    await AsyncStorage.removeItem(LAST_SYNCED_KEY);
    jest.restoreAllMocks();
  });

  it('markSynced updates getLastSyncedAt and persists under LAST_SYNCED_KEY', async () => {
    markSynced(123);

    expect(getLastSyncedAt()).toBe(123);
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(LAST_SYNCED_KEY)).toBe('123');
    });
  });

  it('hydrateLastSynced reads the persisted value back', async () => {
    markSynced(456);
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(LAST_SYNCED_KEY)).toBe('456');
    });

    await AsyncStorage.setItem(LAST_SYNCED_KEY, '789');
    await hydrateLastSynced();

    expect(getLastSyncedAt()).toBe(789);
  });

  it('hydrateLastSynced falls back to null without throwing when nothing is stored', async () => {
    await AsyncStorage.removeItem(LAST_SYNCED_KEY);

    await expect(hydrateLastSynced()).resolves.toBeUndefined();
    expect(getLastSyncedAt()).toBeNull();
  });

  describe('trackSyncActivity', () => {
    let now: number;

    beforeEach(() => {
      now = 1_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now++);
    });

    it('marks synced on a successful query fetch and a successful mutation, never on error', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const untrack = trackSyncActivity(queryClient);

      expect(getLastSyncedAt()).toBeNull();

      await queryClient.fetchQuery({ queryKey: ['sync-ok'], queryFn: async () => 'ok' });
      const afterQuery = getLastSyncedAt();
      expect(afterQuery).not.toBeNull();

      await queryClient
        .fetchQuery({
          queryKey: ['sync-bad'],
          queryFn: async () => {
            throw new Error('boom');
          },
        })
        .catch(() => {
          // Expected: a failed fetch must not mark synced.
        });
      expect(getLastSyncedAt()).toBe(afterQuery);

      const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: async () => 'done' });
      await mutation.execute(undefined);
      const afterMutation = getLastSyncedAt();
      expect(afterMutation).not.toBeNull();
      expect(afterMutation).toBeGreaterThan(afterQuery as number);

      const failingMutation = queryClient.getMutationCache().build(queryClient, {
        mutationFn: async () => {
          throw new Error('mutation failed');
        },
      });
      await failingMutation.execute(undefined).catch(() => {
        // Expected: a failed mutation must not mark synced.
      });
      expect(getLastSyncedAt()).toBe(afterMutation);

      untrack();
    });

    it('IN-A03: the sign-out wipe resets the in-memory last-synced time and tells subscribers', async () => {
      markSynced(123);
      const listener = jest.fn();
      const unsubscribe = subscribeLastSynced(listener);

      await wipeDeviceData();

      expect(getLastSyncedAt()).toBeNull();
      expect(listener).toHaveBeenCalled();
      expect(await AsyncStorage.getItem(LAST_SYNCED_KEY)).toBeNull();
      unsubscribe();
    });

    it('WR-A07: a local optimistic setQueryData never counts as a sync', async () => {
      const queryClient = new QueryClient();
      const before = getLastSyncedAt();
      const untrack = trackSyncActivity(queryClient);

      await act(() => {
        onlineManager.setOnline(false);
      });
      queryClient.setQueryData(['transactions', 'h1', '2026-09'], [{ id: 'optimistic' }]);
      queryClient.setQueryData(['transactions', 'h1', '2026-09'], (old: unknown[] | undefined) => [...(old ?? []), { id: 'x' }]);

      expect(getLastSyncedAt()).toBe(before);
      untrack();
    });
  });
});
