/**
 * HH-11: the Realtime reconciler. Pure: no I/O, no React.
 *
 * Every incoming postgres_changes event is applied, held or dropped by row version only,
 * never by arrival order. The four cases:
 *  1. No pending local write, event newer than the cache -> apply.
 *  2. A write to the same row is still queued -> hold. The server's version check refuses
 *     the stale queued write and failedWrites names who changed the row (D-14).
 *  3. Own-write echo (event version <= cache version) -> drop.
 *  4. Genuine version conflict (newer event while a write is queued) -> same as hold.
 * An event older than the cache is stale and dropped for the same reason as an echo.
 */
export type ReconcileDecision = 'drop' | 'hold' | 'apply';

export function reconcile(
  eventVersion: number,
  cacheVersion: number | undefined,
  hasPendingWrite: boolean
): ReconcileDecision {
  if (cacheVersion !== undefined && eventVersion <= cacheVersion) return 'drop';
  if (hasPendingWrite) return 'hold';
  return 'apply';
}

export interface RealtimeRowEvent {
  table: string;
  householdId: string;
  id: string;
  version: number;
}

/** A stale channel (after leave/remove) can still deliver; other-household events are dropped. */
export function reconcileEvent(
  event: RealtimeRowEvent,
  activeHouseholdId: string | null,
  cacheVersion: number | undefined,
  hasPendingWrite: boolean
): ReconcileDecision {
  if (event.householdId !== activeHouseholdId) return 'drop';
  return reconcile(event.version, cacheVersion, hasPendingWrite);
}
