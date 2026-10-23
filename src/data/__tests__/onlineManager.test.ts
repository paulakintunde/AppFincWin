// SYN-01/SYN-02/SYN-06: proves isReachable's truth table, that startOnlineManager wires
// NetInfo into TanStack Query's onlineManager exactly once regardless of call count, and that
// a simulated NetInfo event actually flips onlineManager.isOnline().
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { getEnv } from '@/config/env';
import { afterCacheRestore, isReachable, reachabilityTest, resetOnlineManagerForTests, startOnlineManager } from '../onlineManager';

jest.mock('@/config/env', () => ({ getEnv: () => ({ supabaseUrl: 'https://abc.supabase.co/' }) }));

const qc = new QueryClient();

describe('isReachable', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: null, isInternetReachable: null }, true],
    [{ isConnected: false, isInternetReachable: true }, false],
    [{ isConnected: false, isInternetReachable: null }, false],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: false, isInternetReachable: false }, false],
  ])('isReachable(%o) === %s', (state, expected) => {
    expect(isReachable(state)).toBe(expected);
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
    const invalidate = jest.spyOn(qc3, 'invalidateQueries').mockResolvedValue(undefined);
    const replay = jest.fn(() => new Promise<void>(() => undefined)); // a write that never settles
    afterCacheRestore(qc3, replay);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1); // synchronously, with the replay still pending
  });
});
