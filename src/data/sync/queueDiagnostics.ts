// 05.3-103 (UAT gap 22): dev-only; never ships data off the device; ids and keys only.
// Logs each online/offline change with its source and the write queue head, so a device re-check
// can tell a real network "offline" from a busy queue. No variables, names or amounts are read.
import type { QueryClient } from '@tanstack/react-query';
import { WRITE_SCOPE } from '../keys';
import { netClass, type NetClass, type NetState } from './connectivity';

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

let last: { net: NetClass; online: boolean } | null = null;

/** Test seam. */
export function resetQueueDiagnosticsForTests(): void {
  last = null;
}

/**
 * 05.3-116: `net` is the raw class of the report (so a reachability blip still shows in the log)
 * and `online` is the value the online gate put in force. A line is written when either changes.
 */
export function recordOnlineChange(source: OnlineSource, state: NetState, online: boolean, head: QueueHead | null): void {
  const net = netClass(state);
  if (last && last.net === net && last.online === online) return;
  last = { net, online };
  console.log(
    DIAG_TAG,
    JSON.stringify({
      source,
      net,
      online,
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      head,
    }),
  );
}
