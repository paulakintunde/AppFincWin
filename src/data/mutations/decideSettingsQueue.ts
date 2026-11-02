// 05.3-117 (UAT gap 35, cache part): the two decide_settings mutations (setup steps in decideSetup.ts, plain
// settings in decideSettings.ts) write the same row through the same serial queue, so they share one view of
// the changes still queued and one server-confirmed row per user. A save that lands re-applies every change
// still queued behind it, of either kind, so an earlier save's server row never wipes a later change from the
// cache. Only this user's still-pending edits are layered on (a refused edit has left the queue by then).
import type { Mutation, QueryClient } from '@tanstack/react-query';
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';
import { mutationKeys } from '@/data/keys';
import { registerWipeHandler } from '@/services/storage/wipe';

interface QueuedVars {
  userId: string;
  patch: unknown;
}

/**
 * WR-A07: the last settings row the server confirmed, per user, captured by the oldest queued edit's onMutate (it
 * reads the cache before any optimistic edit of the run) and on every success of either kind. A refused edit
 * rebuilds the cache from it plus the edits still queued, instead of restoring its own `previous`, which may hold
 * an earlier edit's value. In memory only: after a restart a replayed edit falls back to `previous`, and the
 * refetch in onError corrects it.
 */
export const confirmedSettings = new Map<string, DecideSettingsRow | null>();
registerWipeHandler({
  id: 'decide-settings-confirmed',
  wipe: async () => {
    confirmedSettings.clear();
  },
});

/** The pending settings mutations of both kinds for this user, in the order they were made. */
function queued(qc: QueryClient, userId: string): Mutation<unknown, Error, unknown, unknown>[] {
  const cache = qc.getMutationCache();
  return [
    ...cache.findAll({ mutationKey: mutationKeys.updateDecideSetup, status: 'pending' }),
    ...cache.findAll({ mutationKey: mutationKeys.updateDecideSettings, status: 'pending' }),
  ]
    .filter((m) => {
      const v = m.state.variables as QueuedVars | undefined;
      return v !== undefined && v.userId === userId;
    })
    .sort((a, b) => a.mutationId - b.mutationId);
}

/** The patches still queued for this user (both kinds, oldest first), without `exclude` (the caller's own vars). */
export function queuedSettingsPatches(qc: QueryClient, userId: string, exclude: unknown): DecideSettingsPatch[] {
  return queued(qc, userId)
    .map((m) => m.state.variables as QueuedVars)
    .filter((v) => v !== exclude)
    .map((v) => v.patch as DecideSettingsPatch);
}

/** The row with the queued patches layered on in order. */
export function withQueued(row: DecideSettingsRow, patches: readonly DecideSettingsPatch[]): DecideSettingsRow {
  return patches.reduce<DecideSettingsRow>((r, p) => ({ ...r, ...p }), row);
}

/** True when `vars` belongs to this user's oldest pending settings mutation of either kind. */
export function isOldestQueued(qc: QueryClient, vars: { userId: string }): boolean {
  return queued(qc, vars.userId)[0]?.state.variables === vars;
}
