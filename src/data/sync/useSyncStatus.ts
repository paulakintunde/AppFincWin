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
  const queued = useMutationState({ filters: { status: 'pending' } }).length;
  const failedList = useSyncExternalStore(subscribeFailedWrites, getFailedWrites);
  const lastSyncedAt = useSyncExternalStore(subscribeLastSynced, getLastSyncedAt);

  return {
    isOnline,
    queued,
    failed: failedList.filter((entry) => entry.kind !== 'conflict').length,
    conflicts: failedList.filter((entry) => entry.kind === 'conflict').length,
    lastSyncedAt,
  };
}
