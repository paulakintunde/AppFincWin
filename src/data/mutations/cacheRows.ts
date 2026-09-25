// Small list helpers shared by the mutation modules' cache patches.
import { VersionConflictError } from '@/db/errors';

/**
 * WR-A13: a version conflict whose server row already carries every value in `patch` means
 * this edit already landed -- typically an attempt that was in flight when the app was
 * killed and is replayed after restart. The server row is then the successful result, not a
 * "changed elsewhere" conflict. Any other error is rethrown unchanged.
 */
export function acceptIfAlreadyApplied<T>(err: unknown, patch: Record<string, unknown>): T {
  if (err instanceof VersionConflictError && err.serverRow !== null && typeof err.serverRow === 'object') {
    const server = err.serverRow as Record<string, unknown>;
    const keys = Object.keys(patch);
    if (keys.length > 0 && keys.every((k) => server[k] === patch[k])) return err.serverRow as T;
  }
  throw err;
}

/**
 * WR-A04: replaces the row with the same id, or inserts it when it is missing. A queued add's
 * optimistic row can be dropped by a refetch that lands before the write does (reconnect
 * refetches race resumePausedMutations), so a success handler that only replaced in place
 * would leave the saved row missing from the list until some later refetch.
 */
export function upsertRow<T extends { id: string }>(rows: readonly T[], row: T, insertAt: 'start' | 'end'): T[] {
  if (rows.some((r) => r.id === row.id)) return rows.map((r) => (r.id === row.id ? row : r));
  return insertAt === 'start' ? [row, ...rows] : [...rows, row];
}
