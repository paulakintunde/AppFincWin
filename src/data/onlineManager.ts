// SYN-01/SYN-02/SYN-06: bridges NetInfo and AppState into TanStack Query's onlineManager and
// focusManager. Without this, TanStack Query assumes always-online on React Native (it is not
// automatic like it is on web), so offline writes would error instead of pausing and offline
// reads would attempt (and fail) a network fetch instead of serving the cache (RESEARCH
// Pattern 6 gotcha).
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';
import { getEnv } from '@/config/env';
import { createOnlineGate, netClass, type OnlineGate } from './sync/connectivity';
import { queueHead, recordOnlineChange } from './sync/queueDiagnostics';

// 05.3-116 (UAT gap 34): whether a NetInfo report counts as offline is decided by the shared
// online gate in sync/connectivity.ts. null means "not yet known" and never counts as offline; a
// lost connection is offline at once; a failed reachability probe on a working connection is
// offline only after it has lasted UNREACHABLE_GRACE_MS (10 s), so a probe blip on Wi-Fi no longer
// pauses every queued write.

let started = false;
let client: QueryClient | null = null;
let gate: OnlineGate | null = null;

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
 * D-88: after the persister restores the cache, it refetches the stale active reads at once, in parallel with
 * replaying the restored writes. It never waits for a write (a stuck write used to hold the refetch).
 * B-4 (06.1-48): only stale, active reads: restored data still fresh under its staleTime is not refetched, and an
 * inactive read refetches when it is next mounted (it used to refetch every restored read at once on a cold start).
 */
export function afterCacheRestore(qc: QueryClient, replay: (qc: QueryClient) => Promise<void>): void {
  void replay(qc).catch(() => undefined);
  void qc.refetchQueries({ stale: true, type: 'active' }).catch(() => undefined);
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
  gate?.dispose();
  gate = null;
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

  onlineManager.setEventListener((setOnline) => {
    gate?.dispose();
    const own = createOnlineGate(setOnline);
    gate = own;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = own.update(state);
      if (__DEV__) recordOnlineChange('netinfo', state, online, client ? queueHead(client) : null);
      if (online && netClass(state) === 'online' && client) resumeAndRefetch(client);
    });
    return () => {
      own.dispose();
      unsubscribe();
    };
  });

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active');
      if (state !== 'active') return;
      // Ask NetInfo to re-check against Supabase now rather than trusting a stale offline flag.
      void NetInfo.refresh().then(
        (net) => {
          // Fed to the same gate, so an unreachable answer here gets the same 10 s grace.
          const online = gate ? gate.update(net) : netClass(net) === 'online';
          if (__DEV__) recordOnlineChange('focus', net, online, client ? queueHead(client) : null);
          if (online && netClass(net) === 'online' && client) resumeAndRefetch(client);
        },
        () => {
          if (client) resumeAndRefetch(client);
        },
      );
    });
    return () => subscription.remove();
  });
}
