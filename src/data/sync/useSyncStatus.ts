import { useSyncExternalStore } from 'react';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { getFailedWrites, subscribeFailedWrites } from './failedWrites';
import { getLastSyncedAt, subscribeLastSynced } from './lastSynced';

export interface SyncStatus {
  isOnline: boolean;
  queued: number;
  failed: number;
  conflicts: number;
  lastSyncedAt: number | null;
  /**
   * D-88: when the oldest write still pending was submitted (ms epoch), whether it is in flight, waiting its
   * turn or waiting for a retry; null when nothing is pending. Optional so a caller that only knows counts
   * (a test stand-in) still type-checks; a missing value means "age unknown".
   */
  oldestPendingAt?: number | null;
  /** D-88: when the oldest write that is on the wire right now was submitted; null when none is. */
  inFlightOldestAt?: number | null;
}

interface PendingWrite {
  submittedAt: number;
  /** On the wire: not waiting for its turn, the network or a retry. */
  inFlight: boolean;
}

/** Oldest submission time among the writes that pass `keep`, or null when none do. */
function oldest(writes: readonly PendingWrite[], keep: (w: PendingWrite) => boolean): number | null {
  let result: number | null = null;
  for (const w of writes) {
    if (keep(w) && (result === null || w.submittedAt < result)) result = w.submittedAt;
  }
  return result;
}

/**
 * SYN-06: everything the app needs to tell the user whether it is offline, how many
 * changes are waiting, which failed, which conflicted, and when it last synced -- read
 * straight from TanStack Query's own mutation cache plus this module's failed-write and
 * last-synced stores. No separate queue-tracking data structure.
 */
export function useSyncStatus(): SyncStatus {
  const isOnline = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline());
  // Paused (offline-queued) and in-flight mutations both report status 'pending' -- both
  // are "queued" from the user's perspective.
  const pending = useMutationState<PendingWrite>({
    filters: { status: 'pending' },
    // A write waiting behind another one, for the network or for a retry backoff is not in flight.
    select: (m) => ({ submittedAt: m.state.submittedAt, inFlight: !m.state.isPaused && m.state.failureCount === 0 }),
  });
  const queued = pending.length;
  const failedList = useSyncExternalStore(subscribeFailedWrites, getFailedWrites);
  const lastSyncedAt = useSyncExternalStore(subscribeLastSynced, getLastSyncedAt);

  return {
    isOnline,
    queued,
    failed: failedList.filter((entry) => entry.kind !== 'conflict').length,
    conflicts: failedList.filter((entry) => entry.kind === 'conflict').length,
    lastSyncedAt,
    oldestPendingAt: oldest(pending, () => true),
    inFlightOldestAt: oldest(pending, (w) => w.inFlight),
  };
}
