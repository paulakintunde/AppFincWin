// 05.3-116 (UAT gap 34): one pure rule for when the app counts as offline, shared by the
// onlineManager bridge and the [sync-diag] log. No React, no NetInfo: timers are injected.
//
// A lost connection (isConnected false: airplane mode, Wi-Fi off) is offline at once. A failed
// reachability probe on a working connection is only offline once it has lasted
// UNREACHABLE_GRACE_MS, because the Supabase probe flaps to false for a moment on Wi-Fi and each
// flap used to pause every queued write. Any reachable or not-yet-known report is online at once.

export type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };

export type NetClass = 'online' | 'offline' | 'unreachable';

/** null means "not known yet", so it never counts as offline (no offline flash at boot). */
export function netClass(s: NetState): NetClass {
  if (s.isConnected === false) return 'offline';
  if (s.isInternetReachable === false) return 'unreachable';
  return 'online';
}

/** Owner decision (05.3-116): a reachability failure must last 10 seconds to count as offline. */
export const UNREACHABLE_GRACE_MS = 10_000;

export type GateTimers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const defaultTimers: GateTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type OnlineGate = {
  /** Feeds one network report; returns the online value in force after it. */
  update(s: NetState): boolean;
  isOnline(): boolean;
  /** Cancels a pending offline timer. */
  dispose(): void;
};

export function createOnlineGate(setOnline: (online: boolean) => void, timers: GateTimers = defaultTimers): OnlineGate {
  let online = true;
  let pending: unknown = null;
  let hasPending = false;

  const cancel = (): void => {
    if (!hasPending) return;
    timers.clear(pending);
    pending = null;
    hasPending = false;
  };

  const set = (value: boolean): void => {
    online = value;
    setOnline(value);
  };

  return {
    update(s) {
      const cls = netClass(s);
      if (cls === 'online') {
        cancel();
        set(true);
      } else if (cls === 'offline') {
        cancel();
        set(false);
      } else if (online && !hasPending) {
        // Sustained means since the first unreachable report: repeats do not restart the timer.
        hasPending = true;
        pending = timers.set(() => {
          pending = null;
          hasPending = false;
          set(false);
        }, UNREACHABLE_GRACE_MS);
      }
      return online;
    },
    isOnline: () => online,
    dispose: cancel,
  };
}
