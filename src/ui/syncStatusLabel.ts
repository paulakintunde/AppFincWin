/**
 * Pure status-to-copy mapping for SYN-06's sync status line (D-14, amended by D-88 / R16.4). No React,
 * no I/O -- SyncStatusLine.tsx is the only caller and supplies live state plus Date.now().
 *
 * The line is quiet unless something is slow or wrong:
 *   - hidden while every write is younger than 5 s and nothing failed;
 *   - "Saving…" for a write on the wire for 5 s or more;
 *   - "{n} changes waiting" for writes waiting (their turn, or a retry) for 5 s or more;
 *   - "offline · {n} changes waiting" / "offline" while offline;
 *   - the failure and conflict lines, unchanged.
 * "synced … ago" is not on the line; the expanded detail asks for it with `detail`.
 */
import type { SyncStatus } from '@/data/sync/useSyncStatus';

export type SyncLabelKey =
  | 'sync.offline'
  | 'sync.offlineWaiting'
  | 'sync.saving'
  | 'sync.waiting'
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
  /** Null when the line has nothing to say (every write is young and nothing failed). */
  primary: SyncLabel | null;
  failed: number;
  conflicts: number;
}

const MINUTE_MS = 60_000;

/** A write must be this old before the line speaks about it (D-88). */
export const SYNC_LINE_THRESHOLD_MS = 5000;

function syncedLabel(status: SyncStatus, now: number): SyncLabel {
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

/** An age is over the threshold; a write whose age is unknown (a count-only status) counts as over it. */
function isOld(since: number | null | undefined, now: number): boolean {
  return since === null || since === undefined || now - since >= SYNC_LINE_THRESHOLD_MS;
}

function primaryLabel(status: SyncStatus, now: number, detail: boolean): SyncLabel | null {
  if (!status.isOnline) {
    return status.queued > 0 ? { key: 'sync.offlineWaiting', count: status.queued } : { key: 'sync.offline' };
  }

  if (status.queued > 0) {
    if (status.inFlightOldestAt != null && isOld(status.inFlightOldestAt, now)) return { key: 'sync.saving' };
    if (isOld(status.oldestPendingAt, now)) return { key: 'sync.waiting', count: status.queued };
    return detail ? syncedLabel(status, now) : null;
  }

  return detail ? syncedLabel(status, now) : null;
}

/**
 * `detail` is the expanded sync detail: when the line would be hidden it reads the "synced … ago" text
 * instead. The tab headers never ask for it.
 */
export function syncStatusLabel(status: SyncStatus, now: number, detail = false): SyncStatusLabelResult {
  return {
    primary: primaryLabel(status, now, detail),
    failed: status.failed,
    conflicts: status.conflicts,
  };
}

/**
 * The time (ms epoch) at which a pending write next crosses the 5 s threshold, so the line can
 * appear with no other change; null when no write is still young (nothing to wait for).
 */
export function nextSyncLineChangeAt(status: SyncStatus, now: number): number | null {
  if (!status.isOnline || status.queued === 0) return null;
  let next: number | null = null;
  for (const since of [status.inFlightOldestAt, status.oldestPendingAt]) {
    if (since === null || since === undefined) continue;
    const due = since + SYNC_LINE_THRESHOLD_MS;
    if (due > now && (next === null || due < next)) next = due;
  }
  return next;
}
