// B-5 (06.1-48): the whole persister wrapper is throttled. Every cache event used to run the queued-write stringify, an
// AsyncStorage read for overflow rows, the dev byte log and the encryption before the base persister's own throttle.
// Now a burst of cache events costs one save, and going to the background saves at once (queued writes are never at risk).
import { AppState } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import { addBreadcrumb } from '@sentry/react-native';
import {
  createEncryptedPersister,
  flushPersist,
  persister,
  persistOptions,
  startPersistOnBackground,
  startThrottledPersist,
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

  it('06.1-73: persistLater runs the dehydrate once, when the scheduled save fires, for a burst of cache events', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    const build = jest.fn(() => client(5));
    for (let i = 0; i < 25; i++) {
      p.persistLater(build);
      await jest.advanceTimersByTimeAsync(24);
    }
    expect(build).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(build).toHaveBeenCalledTimes(1);
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
  });

  it('06.1-73: persistNow saves the given client at once and drops a pending build; removeClient drops it too', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    const build = jest.fn(() => client(1));
    p.persistLater(build);
    await p.persistNow(client(9));
    expect((mockBasePersist.mock.calls[0]![0] as PersistedClient).timestamp).toBe(9);
    await jest.advanceTimersByTimeAsync(2000);
    expect(build).not.toHaveBeenCalled();
    p.persistLater(build);
    await p.removeClient();
    await jest.advanceTimersByTimeAsync(2000);
    expect(build).not.toHaveBeenCalled();
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
  });

  it('06.1-73: a build that throws skips the save instead of breaking the chain', async () => {
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 0);
    p.persistLater(() => {
      throw new Error('dehydrate failed');
    });
    await p.flush();
    expect(mockBasePersist).not.toHaveBeenCalled();
    await p.persistClient(client(3));
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
  });

  it('06.1-73: startThrottledPersist dehydrates once per window for many cache events, with the persist options', async () => {
    jest.useFakeTimers();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 1000);
    const qc = new QueryClient();
    const stop = startThrottledPersist(qc, p, persistOptions);
    for (let i = 0; i < 30; i++) qc.setQueryData(['k', i], i);
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
    const saved = mockBasePersist.mock.calls[0]![0] as PersistedClient;
    expect(saved.buster).toBe(persistOptions.buster);
    expect(saved.clientState.queries).toHaveLength(30);
    stop();
    qc.setQueryData(['k', 99], 1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockBasePersist).toHaveBeenCalledTimes(1);
  });

  it('06.1-73: each save leaves one persist breadcrumb with numbers only', async () => {
    (addBreadcrumb as jest.Mock).mockClear();
    const p = createEncryptedPersister(fakeStorage() as unknown as LargeSecureStore, 0);
    await p.persistClient(client(1));
    const crumbs = (addBreadcrumb as jest.Mock).mock.calls.map((c) => c[0] as { category: string; message: string; data: Record<string, unknown> });
    const saved = crumbs.filter((b) => b.category === 'persist' && b.message === 'saved');
    expect(saved).toHaveLength(1);
    for (const v of Object.values(saved[0]!.data)) expect(typeof v).toBe('number');
  });
});
