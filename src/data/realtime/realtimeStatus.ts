/**
 * HH-11: whether the household channel is delivering. 'live' also covers "no channel needed" (a household of one), so the
 * status line only ever speaks when a channel that should be up is not.
 */
import { useSyncExternalStore } from 'react';

export type RealtimeStatus = 'live' | 'connecting' | 'paused';

let current: RealtimeStatus = 'live';
const listeners = new Set<() => void>();

export function getRealtimeStatus(): RealtimeStatus {
  return current;
}

export function setRealtimeStatus(next: RealtimeStatus): void {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeRealtimeStatus, getRealtimeStatus, getRealtimeStatus);
}
