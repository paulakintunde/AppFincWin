// 08-13 (HH-03): household notices (household_events) and the per-user read marker.
// RLS already limits events to the ones whose audience includes the caller.

import { toDbError } from './errors';
import type { DbClient } from './rows';

export const HOUSEHOLD_EVENT_COLUMNS = 'id, household_id, kind, actor_id, subject_id, ref_id, params, created_at';

export interface HouseholdEventRow {
  id: string;
  household_id: string;
  kind: string;
  actor_id: string | null;
  subject_id: string | null;
  ref_id: string | null;
  params: Record<string, unknown>;
  created_at: string;
}

/** Newest first. */
export async function fetchHouseholdEvents(client: DbClient, householdId: string, limit = 50): Promise<HouseholdEventRow[]> {
  const { data, error, status } = await client
    .from('household_events')
    .select(HOUSEHOLD_EVENT_COLUMNS)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toDbError(error, status);
  return (data as HouseholdEventRow[] | null) ?? [];
}

export async function markHouseholdEventsRead(client: DbClient): Promise<void> {
  const { error, status } = await client.rpc('mark_household_events_read');
  if (error) throw toDbError(error, status);
}

/** The time the caller last opened the notices, or null when they never have. */
export async function fetchEventReadMarker(client: DbClient, userId: string): Promise<string | null> {
  const { data, error, status } = await client
    .from('household_event_reads')
    .select('last_read_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as { last_read_at: string } | null)?.last_read_at ?? null;
}
