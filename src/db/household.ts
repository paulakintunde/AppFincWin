// D-06: one household in v1 (a household of one for most users) -- this reads the
// membership row Phase 0's handle_new_user() trigger already provisions at signup.

import { toDbError } from './errors';
import type { DbClient } from './rows';

export async function fetchCurrentHouseholdId(client: DbClient, userId: string): Promise<string | null> {
  const { data, error, status } = await client
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as { household_id: string } | null)?.household_id ?? null;
}
