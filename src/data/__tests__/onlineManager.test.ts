// SYN-01/SYN-02/SYN-06: proves the shared netClass truth table, that startOnlineManager wires
// NetInfo into TanStack Query's onlineManager exactly once regardless of call count, and that
// a simulated NetInfo event actually flips onlineManager.isOnline().
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { getEnv } from '@/config/env';
import { afterCacheRestore, reachabilityTest, resetOnlineManagerForTests, startOnlineManager } from '../onlineManager';
import { netClass, UNREACHABLE_GRACE_MS } from '../sync/connectivity';

jest.mock('@/config/env', () => ({ getEnv: () => ({ supabaseUrl: 'https://abc.supabase.co/' }) }));

const qc = new QueryClient();

describe('netClass (05.3-116: one shared predicate)', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, 'online'],
    [{ isConnected: true, isInternetReachable: null }, 'online'],
    [{ isConnected: null, isInternetReachable: null }, 'online'],
    [{ isConnected: false, isInternetReachable: true }, 'offline'],
    [{ isConnected: false, isInternetReachable: null }, 'offline'],
    // Was offline at once before 05.3-116; now offline only after the 10 s grace (UAT gap 34).
    [{ isConnected: true, isInternetReachable: false }, 'unreachable'],
    [{ isConnected: false, isInternetReachable: false }, 'offline'],
  ] as const)('netClass(%o) === %s', (state, expected) => {
    expect(netClass(state)).toBe(expected);
  });
});

describe('startOnlineManager', () => {
  // startOnlineManager is idempotent at module scope (a `started` guard), so these two tests
  // share one real registration on purpose: the first proves it only happens once, the second
  // reuses the listener that registration captured. Mocks are intentionally not cleared
  // between them for that reason.
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('registers exactly one NetInfo listener even when called more than once', () => {
    startOnlineManager(qc);
    startOnlineManager(qc);

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('flips onlineManager.isOnline() to false when NetInfo reports offline', () => {
    const netInfoListener = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0] as (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => void;

    netInfoListener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    netInfoListener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('D-88 reachability is checked against Supabase', async () => {
    const cfg = (NetInfo.configure as jest.Mock).mock.calls[0][0] as {
      reachabilityUrl: string;
      reachabilityTest: (r: { status: number }) => Promise<boolean>;
    };
    expect(cfg.reachabilityUrl).toBe(`${getEnv().supabaseUrl.replace(/\/+$/, '')}/rest/v1/`);
    await expect(cfg.reachabilityTest({ status: 401 })).resolves.toBe(true);
    await expect(cfg.reachabilityTest({ status: 200 })).resolves.toBe(true);
    await expect(cfg.reachabilityTest({ status: 503 })).resolves.toBe(false);
    await expect(reachabilityTest({ status: 499 })).resolves.toBe(true);
  });

  it('D-88 coming back resumes paused writes and refetches', async () => {
    const resume = jest.spyOn(qc, 'resumePausedMutations').mockResolvedValue(undefined);
    const refetch = jest.spyOn(qc, 'refetchQueries').mockResolvedValue(undefined);
    const netInfoListener = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0] as (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => void;

    // NetInfo going offline resumes nothing.
    netInfoListener({ isConnected: false, isInternetReachable: false });
    expect(resume).not.toHaveBeenCalled();

    // NetInfo reachable: online, replay writes, refetch stale queries.
    netInfoListener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ stale: true });
  });
});

describe('startOnlineManager on app focus', () => {
  it('D-88 coming back resumes paused writes and refetches when the app returns to the foreground', async () => {
    const spy = jest.spyOn(AppState, 'addEventListener');
    const qc2 = new QueryClient();
    const resume = jest.spyOn(qc2, 'resumePausedMutations').mockResolvedValue(undefined);
    const refetch = jest.spyOn(qc2, 'refetchQueries').mockResolvedValue(undefined);
    resetOnlineManagerForTests();
    startOnlineManager(qc2);
    const listener = spy.mock.calls.find((c) => c[0] === 'change')?.[1] as (s: string) => void;
    expect(listener).toBeDefined();

    listener('background');
    expect(resume).not.toHaveBeenCalled();

    listener('active');
    await new Promise((resolve) => setImmediate(resolve));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ stale: true });
    spy.mockRestore();
  });
});

describe('afterCacheRestore', () => {
  it('D-88 the cache refetches without waiting for writes after restore', () => {
    const qc3 = new QueryClient();
    const order: string[] = [];
    const refetch = jest.spyOn(qc3, 'refetchQueries').mockImplementation(async () => {
      order.push('refetch');
    });
    const invalidate = jest.spyOn(qc3, 'invalidateQueries');
    const replay = jest.fn(() => {
      order.push('replay');
      return new Promise<void>(() => undefined); // a write that never settles
    });
    afterCacheRestore(qc3, replay);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1); // synchronously, with the replay still pending
    expect(refetch).toHaveBeenCalledWith({ stale: true, type: 'active' });
    expect(order).toEqual(['replay', 'refetch']);
    expect(invalidate).not.toHaveBeenCalled();
  });

  // B-4 (06.1-48): a cold start no longer refetches every restored read at once.
  it('B-4 fresh restored data inside its staleTime is not refetched; stale data is', async () => {
    const qc5 = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000 } } });
    const freshFn = jest.fn(async () => 'fresh-server');
    const staleFn = jest.fn(async () => 'stale-server');
    qc5.setQueryData(['fresh'], 'restored', { updatedAt: Date.now() });
    qc5.setQueryData(['stale'], 'restored', { updatedAt: Date.now() - 6 * 60_000 });
    // Active observers, as a mounted screen would have (no initial fetch: data is there and not stale for 'fresh').
    const o1 = new QueryObserver(qc5, { queryKey: ['fresh'], queryFn: freshFn, refetchOnMount: false });
    const o2 = new QueryObserver(qc5, { queryKey: ['stale'], queryFn: staleFn, refetchOnMount: false });
    const u1 = o1.subscribe(() => undefined);
    const u2 = o2.subscribe(() => undefined);

    afterCacheRestore(qc5, () => Promise.resolve());
    await new Promise((r) => setTimeout(r, 0));

    expect(freshFn).not.toHaveBeenCalled();
    expect(staleFn).toHaveBeenCalledTimes(1);
    u1();
    u2();
    qc5.clear();
  });
});

type NetListener = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;

// 05.3-116 (UAT gap 34): a short reachability blip on a working connection must not pause writes.
describe('startOnlineManager reachability grace', () => {
  let qc4: QueryClient;
  let listener: NetListener;
  let appState: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    // Every registration hands back a real subscription, so re-registering can remove the last one.
    appState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => undefined }) as never);
    resetOnlineManagerForTests();
    onlineManager.setOnline(true);
    (NetInfo.addEventListener as jest.Mock).mockClear();
    qc4 = new QueryClient();
    startOnlineManager(qc4);
    const calls = (NetInfo.addEventListener as jest.Mock).mock.calls;
    listener = calls[calls.length - 1][0] as NetListener;
  });

  afterEach(() => {
    resetOnlineManagerForTests();
    onlineManager.setOnline(true);
    jest.useRealTimers();
    appState.mockRestore();
  });

  it('a blip under 10 s stays online and a write still runs; 10 s sustained goes offline', async () => {
    listener({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(true);

    const mutation = qc4.getMutationCache().build(qc4, { mutationFn: () => Promise.resolve('saved') });
    const done = mutation.execute(undefined);
    await jest.advanceTimersByTimeAsync(0);
    expect(mutation.state.isPaused).toBe(false);
    await expect(done).resolves.toBe('saved');

    await jest.advanceTimersByTimeAsync(UNREACHABLE_GRACE_MS - 1);
    expect(onlineManager.isOnline()).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('a lost connection is offline at once', () => {
    listener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('a reachable report inside the grace keeps it online and replays paused writes', () => {
    const resume = jest.spyOn(qc4, 'resumePausedMutations').mockResolvedValue(undefined);
    jest.spyOn(qc4, 'refetchQueries').mockResolvedValue(undefined);
    listener({ isConnected: true, isInternetReachable: false });
    expect(resume).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(onlineManager.isOnline()).toBe(true);
    listener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20_000);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('an unreachable answer on app focus is fed to the same grace', async () => {
    const focus = appState.mock.calls.find((c) => c[0] === 'change')?.[1] as (s: string) => void;
    const resume = jest.spyOn(qc4, 'resumePausedMutations').mockResolvedValue(undefined);
    (NetInfo.refresh as jest.Mock).mockResolvedValueOnce({ isConnected: true, isInternetReachable: false });

    focus('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(onlineManager.isOnline()).toBe(true);
    expect(resume).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(UNREACHABLE_GRACE_MS);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('resetOnlineManagerForTests cancels a pending offline timer', () => {
    listener({ isConnected: true, isInternetReachable: false });
    resetOnlineManagerForTests();
    jest.advanceTimersByTime(20_000);
    expect(onlineManager.isOnline()).toBe(true);
  });
});
