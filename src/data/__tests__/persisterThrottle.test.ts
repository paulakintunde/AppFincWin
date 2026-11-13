// B-5 (06.1-48): the whole persister wrapper is throttled. Every cache event used to run the queued-write stringify, an
// AsyncStorage read for overflow rows, the dev byte log and the encryption before the base persister's own throttle.
// Now a burst of cache events costs one save, and going to the background saves at once (queued writes are never at risk).
import { AppState } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import {
  createEncryptedPersister,
  flushPersist,
  persister,
  startPersistOnBackground,
  WRITES_OVERFLOW_PREFIX,
} from '../cache/persister';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

const mockBasePersist = jest.fn(async (_c: unknown) => undefined);
const mockBaseRemove = jest.fn(async () => undefined);
jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: () => ({
    persistClient: (c: unknown) => mockBasePersist(c),
    removeClient: () => mockBaseRemove(),
    restoreClient: async () => undefined,
  }),
}));

function fakeStorage() {
  const map = new Map<string, string>();
  const s = {
    getItem: jest.fn(async (k: string) => map.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      map.delete(k);
    }),
  };
  return s;
}

function client(n: number): PersistedClient {
  return { timestamp: n, buster: '9', clientState: { queries: [], mutations: [] } };
}

const overflowReads = (s: ReturnType<typeof fakeStorage>) =>
  s.getItem.mock.calls.filter(([k]) => String(k).startsWith(WRITES_OVERFLOW_PREFIX)).length;

describe('B-5 throttled persister wrapper', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockBasePersist.mockClear();
    mockBaseRemove.mockClear();
  });

  it('25 persistClient calls within 600 ms make exactly one base save, carrying the last client', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    for (let i = 0; i < 25; i++) {
      void p.persistClient(client(i));
      await jest.advanceTimersByTimeAsync(24);
    }
    expect(mockBasePersist).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
    expect((mockBasePersist.mock.calls[0]![0] as PersistedClient).timestamp).toBe(24);
  });

  it('reads overflow rows only on the first save when no save wrote chunks', async () => {
    const storage = fakeStorage();
    const p = createEncryptedPersister(storage as unknown as LargeSecureStore, 0);
    await p.persistClient(client(1));
    const afterFirst = overflowReads(storage);
    expect(afterFirst).toBe(1);
    await p.persistClient(client(2));
    expect(overflowReads(storage)).toBe(afterFirst);
    expect(mockBasePersist).toHaveBeenCalledTimes(2);
  });

  it('flush writes a scheduled save now and is a no-op when nothing is pending', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    await p.flush();
    expect(mockBasePersist).not.toHaveBeenCalled();
    void p.persistClient(client(7));
    await p.flush();
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
  });

  it('removeClient cancels a scheduled save', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    void p.persistClient(client(1));
    await p.removeClient();
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockBasePersist).not.toHaveBeenCalled();
    expect(mockBaseRemove).toHaveBeenCalledTimes(1);
  });

  it('going to the background or inactive flushes the scheduled save at once (flushPersist)', async () => {
    jest.useFakeTimers();
    const handlers: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never);
    const qc = new QueryClient();
    const stop = startPersistOnBackground(qc);
    for (const state of ['background', 'inactive']) {
      mockBasePersist.mockClear();
      void persister.persistClient(client(42));
      handlers.forEach((h) => h(state));
      // Microtasks only: the scheduled 1 s timer has not run.
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(mockBasePersist).toHaveBeenCalled();
      expect((mockBasePersist.mock.calls[0]![0] as PersistedClient).timestamp).toBe(42);
      await jest.advanceTimersByTimeAsync(0);
    }
    stop();
    await flushPersist();
  });
});
