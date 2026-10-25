// SYN-01/SYN-02/SYN-06: bridges NetInfo and AppState into TanStack Query's onlineManager and
// focusManager. Without this, TanStack Query assumes always-online on React Native (it is not
// automatic like it is on web), so offline writes would error instead of pausing and offline
// reads would attempt (and fail) a network fetch instead of serving the cache (RESEARCH
// Pattern 6 gotcha).
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';
import { getEnv } from '@/config/env';

/**
 * null means "not yet known" (NetInfo has not reported a first state, or a platform detail is
 * unsupported) — only an explicit `false` counts as offline, so app boot does not flash an
 * offline state before the first NetInfo event arrives.
 */
export function isReachable(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

let started = false;
let client: QueryClient | null = null;

/**
 * D-88: coming back (app focus or a reachable NetInfo state) sets online, replays the paused
 * writes in order and refetches the stale queries. Both run at once; neither waits for the other.
 */
export function resumeAndRefetch(qc: QueryClient): void {
  onlineManager.setOnline(true);
  void qc.resumePausedMutations().catch(() => undefined);
  void qc.refetchQueries({ stale: true }).catch(() => undefined);
}

/**
 * D-88: after the persister restores the cache, the invalidate starts at once, in parallel with
 * replaying the restored writes. It never waits for a write (a stuck write used to hold the refetch).
 */
export function afterCacheRestore(qc: QueryClient, replay: (qc: QueryClient) => Promise<void>): void {
  void replay(qc).catch(() => undefined);
  void qc.invalidateQueries();
}

/** D-88: NetInfo checks reachability against Supabase itself; any answer under 500 (even 401) is reachable. */
export const REACHABILITY_PATH = '/rest/v1/';

export function reachabilityTest(response: { status: number }): Promise<boolean> {
  return Promise.resolve(response.status < 500);
}

/** Test seam: forgets the registration so a suite can start the manager again with its own client. */
export function resetOnlineManagerForTests(): void {
  started = false;
  client = null;
}

/**
 * Idempotent: safe to call from multiple entry points (e.g. app boot and tests). Pass the
 * QueryClient so reconnecting can resume writes and refetch (a later call may supply it).
 */
export function startOnlineManager(qc?: QueryClient): void {
  if (qc) client ??= qc;
  if (started) return;
  started = true;

  // A missing env is reported loudly by the Supabase client at boot; here it only means NetInfo
  // keeps its default reachability probe.
  try {
    NetInfo.configure({
      reachabilityUrl: `${getEnv().supabaseUrl.replace(/\/+$/, '')}${REACHABILITY_PATH}`,
      reachabilityTest,
    });
  } catch {
    // default probe
  }

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const reachable = isReachable(state);
      setOnline(reachable);
      if (reachable && client) resumeAndRefetch(client);
    }),
  );

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active');
      if (state !== 'active') return;
      // Ask NetInfo to re-check against Supabase now rather than trusting a stale offline flag.
      void NetInfo.refresh().then(
        (net) => {
          if (isReachable(net) && client) resumeAndRefetch(client);
        },
        () => {
          if (client) resumeAndRefetch(client);
        },
      );
    });
    return () => subscription.remove();
  });
}
