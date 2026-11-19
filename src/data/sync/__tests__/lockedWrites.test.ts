/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import { QueryClient } from '@tanstack/react-query';
import { DbError } from '@/db/errors';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  hydrateLockedWrites,
  recordLockedWrite,
  getLockedWrites,
  subscribeLockedWrites,
  replayLockedWrites,
  LOCKED_WRITES_KEY,
  dropLockedWrites,
} from '../lockedWrites';
import { setPlanWriteState } from '../planWriteGuard';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

type GlobalWithStores = typeof globalThis & {
  __lwAsyncStorage?: Map<string, string>;
  __lwSecureStore?: Map<string, string>;
};

function asyncStorageMap(): Map<string, string> {
  const g = globalThis as GlobalWithStores;
  g.__lwAsyncStorage = g.__lwAsyncStorage ?? new Map<string, string>();
  return g.__lwAsyncStorage;
}

function secureStoreMap(): Map<string, string> {
  const g = globalThis as GlobalWithStores;
  g.__lwSecureStore = g.__lwSecureStore ?? new Map<string, string>();
  return g.__lwSecureStore;
}

jest.mock('@react-native-async-storage/async-storage', () => {
  const g = globalThis as GlobalWithStores;
  g.__lwAsyncStorage = g.__lwAsyncStorage ?? new Map<string, string>();
  const store = g.__lwAsyncStorage;
  return {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    clear: jest.fn(async () => {
      store.clear();
    }),
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  };
});

jest.mock('expo-secure-store', () => {
  const g = globalThis as GlobalWithStores;
  g.__lwSecureStore = g.__lwSecureStore ?? new Map<string, string>();
  const store = g.__lwSecureStore;
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

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: jest.fn(() => `lw-${counter++}`) };
});

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
jest.mock('../../cache/persister', () => ({
  clearServerFetchTimes: jest.fn(),
  persister: { removeClient: jest.fn() },
}));

const locked = () => new DbError('plan locked', 'PT402', 402);

async function clearAll(): Promise<void> {
  await wipeDeviceData();
  asyncStorageMap().clear();
  secureStoreMap().clear();
}

describe('lockedWrites', () => {
  afterEach(async () => {
    await clearAll();
    jest.clearAllMocks();
  });

  it('keeps records in order with an id and timestamp, and notifies', async () => {
    const listener = jest.fn();
    const off = subscribeLockedWrites(listener);
    await recordLockedWrite({ mutationKey: ['a'], variables: { n: 1 } });
    await recordLockedWrite({ mutationKey: ['b'], variables: { n: 2 } });
    await recordLockedWrite({ mutationKey: ['c'], variables: { n: 3 } });
    off();
    const list = getLockedWrites();
    expect(list.map((e) => e.mutationKey[0])).toEqual(['a', 'b', 'c']);
    expect(list[0]?.id).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(list[0]!.at))).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('persists encrypted and restores through a fresh module instance', async () => {
    await recordLockedWrite({ mutationKey: ['a'], variables: { note: 'secret groceries' } });
    const stored = asyncStorageMap().get(LOCKED_WRITES_KEY);
    expect(stored).toBeDefined();
    expect(stored).not.toContain('secret groceries');
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../lockedWrites') as typeof import('../lockedWrites');
      await fresh.hydrateLockedWrites();
      expect(fresh.getLockedWrites()).toHaveLength(1);
      expect(fresh.getLockedWrites()[0]?.variables).toEqual({ note: 'secret groceries' });
    });
  });

  it('is cleared by the sign-out wipe', async () => {
    await recordLockedWrite({ mutationKey: ['a'], variables: {} });
    await wipeDeviceData();
    expect(getLockedWrites()).toHaveLength(0);
    expect(asyncStorageMap().has(LOCKED_WRITES_KEY)).toBe(false);
    await hydrateLockedWrites();
    expect(getLockedWrites()).toHaveLength(0);
  });

  it('flags an empty mutationKey as not replayable and skips it on replay', async () => {
    await recordLockedWrite({ mutationKey: undefined, variables: { x: 1 } });
    expect(getLockedWrites()[0]?.replayable).toBe(false);
    const qc = new QueryClient();
    const result = await replayLockedWrites(qc);
    expect(result).toEqual({ synced: 0, stillLocked: 1 });
    expect(getLockedWrites()).toHaveLength(1);
  });

  describe('replay', () => {
    it('runs entries in order and removes each on success', async () => {
      const calls: unknown[] = [];
      const qc = new QueryClient();
      qc.setMutationDefaults(['t'], {
        mutationFn: async (v: unknown) => {
          calls.push(v);
        },
      });
      await recordLockedWrite({ mutationKey: ['t'], variables: 1 });
      await recordLockedWrite({ mutationKey: ['t'], variables: 2 });
      const result = await replayLockedWrites(qc);
      expect(calls).toEqual([1, 2]);
      expect(result).toEqual({ synced: 2, stillLocked: 0 });
      expect(getLockedWrites()).toHaveLength(0);
    });

    it('stops at a second PT402 and keeps that entry and every later one', async () => {
      const calls: unknown[] = [];
      const qc = new QueryClient();
      qc.setMutationDefaults(['t'], {
        mutationFn: async (v: unknown) => {
          calls.push(v);
          if (v === 2) throw locked();
        },
      });
      for (const v of [1, 2, 3]) await recordLockedWrite({ mutationKey: ['t'], variables: v });
      const result = await replayLockedWrites(qc);
      expect(calls).toEqual([1, 2]);
      expect(result).toEqual({ synced: 1, stillLocked: 2 });
      expect(getLockedWrites().map((e) => e.variables)).toEqual([2, 3]);
    });

    it('removes an entry that fails with another error and carries on', async () => {
      const calls: unknown[] = [];
      const qc = new QueryClient();
      qc.setMutationDefaults(['t'], {
        mutationFn: async (v: unknown) => {
          calls.push(v);
          if (v === 1) throw new DbError('rls', '42501', 403);
        },
      });
      await recordLockedWrite({ mutationKey: ['t'], variables: 1 });
      await recordLockedWrite({ mutationKey: ['t'], variables: 2 });
      const result = await replayLockedWrites(qc);
      expect(calls).toEqual([1, 2]);
      expect(result).toEqual({ synced: 1, stillLocked: 0 });
    });
  });
});

describe('queryClient MutationCache onError hook', () => {
  afterEach(async () => {
    await clearAll();
  });

  it('records one locked write for PT402 and none for a 500', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { queryClient } = require('../../queryClient') as typeof import('../../queryClient');
    queryClient.setMutationDefaults(['hook'], {
      mutationFn: async (v: unknown) => {
        if (v === 'locked') throw locked();
        throw new DbError('boom', '', 500);
      },
      retry: false,
    });
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['hook'] })
      .execute('locked')
      .catch(() => undefined);
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['hook'] })
      .execute('boom')
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20));
    const list = getLockedWrites();
    expect(list).toHaveLength(1);
    expect(list[0]?.variables).toBe('locked');
  });

  // 09-25 (A2-W): D-40 is for a lapsed plan, not the look-around before a trial.
  it('does not keep a refusal that arrives while the plan view is sample', async () => {
    setPlanWriteState({ status: 'sample', writable: false, loading: false });
    try {
      await recordLockedWrite({ mutationKey: ['decide-settings', 'update'], variables: {} });
      expect(getLockedWrites()).toHaveLength(0);
    } finally {
      setPlanWriteState(null);
    }
  });

  it('still keeps a refusal while locked, or while the plan is loading', async () => {
    setPlanWriteState({ status: 'locked', writable: false, loading: false });
    await recordLockedWrite({ mutationKey: ['a'], variables: {} });
    setPlanWriteState({ status: 'sample', writable: false, loading: true });
    await recordLockedWrite({ mutationKey: ['b'], variables: {} });
    setPlanWriteState(null);
    expect(getLockedWrites()).toHaveLength(2);
  });

  it('dropLockedWrites clears every kept write and the stored copy', async () => {
    await recordLockedWrite({ mutationKey: ['a'], variables: {} });
    await recordLockedWrite({ mutationKey: ['b'], variables: {} });
    await expect(dropLockedWrites()).resolves.toBe(2);
    expect(getLockedWrites()).toHaveLength(0);
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../lockedWrites') as typeof import('../lockedWrites');
      await fresh.hydrateLockedWrites();
      expect(fresh.getLockedWrites()).toHaveLength(0);
    });
  });
});
