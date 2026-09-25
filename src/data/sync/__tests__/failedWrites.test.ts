// react-native-get-random-values falls back to a native module that doesn't exist under
// Jest; LargeSecureStore (imported transitively by the module under test) needs a real
// crypto.getRandomValues. Babel hoists imports above other top-level code, so this exists
// as defense in depth (mirrors src/services/supabase/__tests__/largeSecureStore.test.ts).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = require('crypto').webcrypto;

import { getPendingWriteCount, wipeDeviceData } from '@/services/storage/wipe';
import {
  FAILED_WRITES_KEY,
  hydrateFailedWrites,
  recordFailedWrite,
  dismissFailedWrite,
  getFailedWrites,
  subscribeFailedWrites,
  setFailureReporter,
} from '../failedWrites';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

// Backed by globalThis rather than a module-local closure, so the mocked storage survives
// jest.isolateModulesAsync's fresh module registry (simulating an app restart: storage
// persists, in-memory module state does not). Each factory below lazily creates its own map
// the first time it runs, rather than relying on a separate top-level assignment -- Babel
// hoists jest.mock() calls above other top-level statements, and importing the module under
// test synchronously triggers these factories (via its LargeSecureStore dependency) before
// any later top-level statement in this file would otherwise have run.
type GlobalWithStores = typeof globalThis & {
  __fwAsyncStorage?: Map<string, string>;
  __fwSecureStore?: Map<string, string>;
};

function asyncStorageMap(): Map<string, string> {
  const g = globalThis as GlobalWithStores;
  g.__fwAsyncStorage = g.__fwAsyncStorage ?? new Map<string, string>();
  return g.__fwAsyncStorage;
}

function secureStoreMap(): Map<string, string> {
  const g = globalThis as GlobalWithStores;
  g.__fwSecureStore = g.__fwSecureStore ?? new Map<string, string>();
  return g.__fwSecureStore;
}

jest.mock('@react-native-async-storage/async-storage', () => {
  const g = globalThis as GlobalWithStores;
  g.__fwAsyncStorage = g.__fwAsyncStorage ?? new Map<string, string>();
  const store = g.__fwAsyncStorage;
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
    // wipeDeviceData() (src/services/storage/wipe.ts) calls multiRemove directly.
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  };
});

jest.mock('expo-secure-store', () => {
  const g = globalThis as GlobalWithStores;
  g.__fwSecureStore = g.__fwSecureStore ?? new Map<string, string>();
  const store = g.__fwSecureStore;
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

const baseEntry = {
  entity: 'transactions' as const,
  entityId: 'tx-1',
  kind: 'rejected' as const,
  code: '42501',
  attempted: { amount: 500, note: 'groceries' },
};

describe('failedWrites', () => {
  afterEach(async () => {
    // Clear every recorded entry (also exercises persistence for dismiss) then clear the
    // backing stores directly so tests don't leak into each other.
    for (const entry of getFailedWrites()) {
      await dismissFailedWrite(entry.id);
    }
    asyncStorageMap().clear();
    secureStoreMap().clear();
    setFailureReporter(null);
    jest.clearAllMocks();
  });

  it('records an entry with a generated id and ISO timestamp, and notifies subscribers', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeFailedWrites(listener);

    await recordFailedWrite(baseEntry);

    expect(listener).toHaveBeenCalled();
    const [entry] = getFailedWrites();
    expect(entry).toBeDefined();
    expect(entry?.id).toEqual(expect.any(String));
    expect(entry?.id.length).toBeGreaterThan(0);
    expect(entry?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(entry?.entity).toBe('transactions');
    expect(entry?.attempted).toEqual(baseEntry.attempted);

    unsubscribe();
  });

  it('is seen by a fresh module instance after hydrateFailedWrites(), proving it persisted', async () => {
    await recordFailedWrite(baseEntry);
    expect(getFailedWrites()).toHaveLength(1);

    let freshEntries: readonly unknown[] = [];
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../failedWrites') as typeof import('../failedWrites');
      await fresh.hydrateFailedWrites();
      freshEntries = fresh.getFailedWrites();
    });

    expect(freshEntries).toHaveLength(1);
  });

  it('stores ciphertext at FAILED_WRITES_KEY in AsyncStorage, never the attempted note text', async () => {
    await recordFailedWrite(baseEntry);

    const raw = asyncStorageMap().get(FAILED_WRITES_KEY);
    expect(raw).toBeDefined();
    expect(raw).not.toContain('groceries');
    expect(raw).not.toContain('tx-1');
    expect(raw).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/i);
  });

  it('hydrates to an empty list without throwing when the stored value is corrupt', async () => {
    asyncStorageMap().set(FAILED_WRITES_KEY, 'not-a-valid-encrypted-blob');

    await expect(hydrateFailedWrites()).resolves.toBeUndefined();
    expect(getFailedWrites()).toEqual([]);
  });

  it('dismissFailedWrite removes exactly one entry and persists the removal', async () => {
    await recordFailedWrite(baseEntry);
    await recordFailedWrite({ ...baseEntry, entityId: 'tx-2' });
    expect(getFailedWrites()).toHaveLength(2);

    const [first] = getFailedWrites();
    await dismissFailedWrite(first!.id);

    expect(getFailedWrites()).toHaveLength(1);
    expect(getFailedWrites()[0]?.entityId).toBe('tx-2');

    // Persisted: a fresh module load only sees the surviving entry.
    let freshCount = -1;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../failedWrites') as typeof import('../failedWrites');
      await fresh.hydrateFailedWrites();
      freshCount = fresh.getFailedWrites().length;
    });
    expect(freshCount).toBe(1);
  });

  it('calls the failure reporter with only entity, kind and code -- never the attempted payload', async () => {
    const reporter = jest.fn();
    setFailureReporter(reporter);

    await recordFailedWrite(baseEntry);

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith({ entity: 'transactions', kind: 'rejected', code: '42501' });
    const [[payload]] = reporter.mock.calls;
    expect(payload).not.toHaveProperty('attempted');
    expect(JSON.stringify(payload)).not.toContain('groceries');
  });

  it('does not let a throwing reporter break recording', async () => {
    setFailureReporter(() => {
      throw new Error('reporter exploded');
    });

    await expect(recordFailedWrite(baseEntry)).resolves.toBeUndefined();
    expect(getFailedWrites()).toHaveLength(1);
  });

  it('WR-A08: a failure recorded while boot hydration is still reading loses neither the new nor the older entries', async () => {
    await recordFailedWrite({ ...baseEntry, entityId: 'older' });

    let inMemory: string[] = [];
    let afterRestart: string[] = [];
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../failedWrites') as typeof import('../failedWrites');
      // Boot: hydration starts (not awaited, as in QueryProvider) and a resumed mutation is
      // rejected before its read finishes.
      const hydration = fresh.hydrateFailedWrites();
      const recording = fresh.recordFailedWrite({ ...baseEntry, entityId: 'newer' });
      await Promise.all([hydration, recording]);
      inMemory = fresh.getFailedWrites().map((e) => e.entityId);
    });
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../failedWrites') as typeof import('../failedWrites');
      await fresh.hydrateFailedWrites();
      afterRestart = fresh.getFailedWrites().map((e) => e.entityId);
    });

    expect(inMemory).toEqual(['older', 'newer']);
    expect(afterRestart).toEqual(['older', 'newer']);
  });

  it('WR-A08: persists are serialized -- a slow older write can never land after a newer one', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage') as { setItem: jest.Mock };
    const original = AsyncStorage.setItem.getMockImplementation() as (k: string, v: string) => Promise<void>;
    let failedWritesWrites = 0;
    AsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      if (key === FAILED_WRITES_KEY && failedWritesWrites++ === 0) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return original(key, value);
    });

    try {
      await Promise.all([recordFailedWrite({ ...baseEntry, entityId: 'a' }), recordFailedWrite({ ...baseEntry, entityId: 'b' })]);
    } finally {
      AsyncStorage.setItem.mockImplementation(original);
    }

    let persisted: string[] = [];
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../failedWrites') as typeof import('../failedWrites');
      await fresh.hydrateFailedWrites();
      persisted = fresh.getFailedWrites().map((e) => e.entityId);
    });
    expect(persisted).toEqual(['a', 'b']);
  });

  it('WR-A09: parked failed entries count toward the unsynced-changes warning before a wipe', async () => {
    expect(await getPendingWriteCount()).toBe(0);
    await recordFailedWrite(baseEntry);
    await recordFailedWrite({ ...baseEntry, entityId: 'tx-2' });
    expect(await getPendingWriteCount()).toBe(2);
  });

  it('is cleared by wipeDeviceData via the registered "failed-writes" handler', async () => {
    await recordFailedWrite(baseEntry);
    expect(getFailedWrites()).toHaveLength(1);

    await wipeDeviceData();

    expect(getFailedWrites()).toEqual([]);
    expect(asyncStorageMap().has(FAILED_WRITES_KEY)).toBe(false);
  });
});
