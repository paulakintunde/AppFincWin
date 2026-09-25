/**
 * Pure status-to-copy mapping for SYN-06's sync status line (D-14). No React, no I/O --
 * SyncStatusLine.tsx is the only caller and supplies live state plus Date.now().
 */
import type { SyncStatus } from '@/data/sync/useSyncStatus';

export type SyncLabelKey =
  | 'sync.offline'
  | 'sync.offlineQueued'
  | 'sync.queued'
  | 'sync.syncedJustNow'
  | 'sync.syncedMinutes'
  | 'sync.syncedHours'
  | 'sync.syncedDays'
  | 'sync.neverSynced';

export interface SyncLabel {
  key: SyncLabelKey;
  count?: number;
}

export interface SyncStatusLabelResult {
  primary: SyncLabel;
  failed: number;
  conflicts: number;
}

const MINUTE_MS = 60_000;

function primaryLabel(status: SyncStatus, now: number): SyncLabel {
  if (!status.isOnline) {
    return status.queued > 0 ? { key: 'sync.offlineQueued', count: status.queued } : { key: 'sync.offline' };
  }

  if (status.queued > 0) {
    return { key: 'sync.queued', count: status.queued };
  }

  if (status.lastSyncedAt === null) {
    return { key: 'sync.neverSynced' };
  }

  const minutes = Math.floor((now - status.lastSyncedAt) / MINUTE_MS);
  if (minutes < 1) {
    return { key: 'sync.syncedJustNow' };
  }
  if (minutes < 60) {
    return { key: 'sync.syncedMinutes', count: minutes };
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { key: 'sync.syncedHours', count: hours };
  }

  const days = Math.floor(hours / 24);
  return { key: 'sync.syncedDays', count: days };
}

export function syncStatusLabel(status: SyncStatus, now: number): SyncStatusLabelResult {
  return {
    primary: primaryLabel(status, now),
    failed: status.failed,
    conflicts: status.conflicts,
  };
}
