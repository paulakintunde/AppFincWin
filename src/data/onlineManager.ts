// SYN-01/SYN-02/SYN-06: bridges NetInfo and AppState into TanStack Query's onlineManager and
// focusManager. Without this, TanStack Query assumes always-online on React Native (it is not
// automatic like it is on web), so offline writes would error instead of pausing and offline
// reads would attempt (and fail) a network fetch instead of serving the cache (RESEARCH
// Pattern 6 gotcha).
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * null means "not yet known" (NetInfo has not reported a first state, or a platform detail is
 * unsupported) — only an explicit `false` counts as offline, so app boot does not flash an
 * offline state before the first NetInfo event arrives.
 */
export function isReachable(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

let started = false;

/** Idempotent: safe to call from multiple entry points (e.g. app boot and tests). */
export function startOnlineManager(): void {
  if (started) return;
  started = true;

  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(isReachable(state))));

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });
}
