// 05.3-103 (UAT gap 22): dev-only; never ships data off the device; ids and keys only.
// Logs each online/offline change with its source and the write queue head, so a device re-check
// can tell a real network "offline" from a busy queue. No variables, names or amounts are read.
import type { QueryClient } from '@tanstack/react-query';
import { WRITE_SCOPE } from '../keys';

export const DIAG_TAG = '[sync-diag]';

export type QueueHead = {
  key: string;
  status: string;
  isPaused: boolean;
  failureCount: number;
  ageMs: number;
};

export type OnlineSource = 'netinfo' | 'focus';

/** Oldest pending write in WRITE_SCOPE, or null when the queue is empty. */
export function queueHead(qc: QueryClient, now: number = Date.now()): QueueHead | null {
  const pending = qc
    .getMutationCache()
    .getAll()
    .filter((m) => m.options.scope?.id === WRITE_SCOPE.id && (m.state.status === 'pending' || m.state.isPaused));
  if (pending.length === 0) return null;
  const oldest = pending.reduce((a, b) => (b.state.submittedAt < a.state.submittedAt ? b : a));
  const key = oldest.options.mutationKey;
  return {
    key: Array.isArray(key) ? key.map(String).join('.') : '',
    status: oldest.state.status,
    isPaused: oldest.state.isPaused,
    failureCount: oldest.state.failureCount,
    ageMs: Math.max(0, now - oldest.state.submittedAt),
  };
}

let lastOnline: boolean | null = null;

/** Test seam. */
export function resetQueueDiagnosticsForTests(): void {
  lastOnline = null;
}

export function recordOnlineChange(
  source: OnlineSource,
  state: { isConnected: boolean | null; isInternetReachable: boolean | null },
  head: QueueHead | null,
): void {
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  if (online === lastOnline) return;
  lastOnline = online;
  console.log(
    DIAG_TAG,
    JSON.stringify({
      source,
      online,
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      head,
    }),
  );
}
