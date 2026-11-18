// 08-17 (D-26): removed members whose 24-hour undo window is still open, and the owner's "invite again".
// The select list is written inline on purpose: a shared *_COLUMNS constant here would change the cache-shape lock,
// which 08-15 owns for this wave. Only the columns granted to clients are read (the leaver's new household and their
// personal copies stay server-side).

import { toDbError } from './errors';
import type { RpcResult } from './householdMembers';
import type { DbClient } from './rows';

export interface MemberDepartureRow {
  id: string;
  household_id: string;
  user_id: string | null;
  actor_id: string | null;
  kind: 'left' | 'removed';
  undo_until: string;
  restored_at: string | null;
  created_at: string;
}

/** Removals the owner can still undo: kind removed, not restored, window not closed. Newest first. */
export async function fetchOpenDepartures(client: DbClient, householdId: string): Promise<MemberDepartureRow[]> {
  const { data, error, status } = await client
    .from('member_departures')
    .select('id, household_id, user_id, actor_id, kind, undo_until, restored_at, created_at')
    .eq('household_id', householdId)
    .eq('kind', 'removed')
    .is('restored_at', null)
    .gt('undo_until', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw toDbError(error, status);
  return (data as MemberDepartureRow[] | null) ?? [];
}

/** Makes an invite for a removed person. Refusals: not_owner, not_found, already_restored, window_closed, full, try_again. */
export async function reinviteRemoved(client: DbClient, departureId: string) {
  const { data, error, status } = await client.rpc('reinvite_removed', { p_departure_id: departureId });
  if (error) throw toDbError(error, status);
  return data as RpcResult<{ invite_id: string; code: string; expires_at: string }>;
}
