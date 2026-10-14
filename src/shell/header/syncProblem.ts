import type { SyncStatus } from '@/data/sync/useSyncStatus';

/** D-15: the header sync line shows only when offline, holding queued writes, or holding a failed/conflicting write. */
export function hasSyncProblem(s: SyncStatus): boolean {
  return !s.isOnline || s.queued > 0 || s.failed > 0 || s.conflicts > 0;
}
