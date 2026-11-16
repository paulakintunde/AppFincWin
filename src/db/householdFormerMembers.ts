// 08-15 (D-25, D-29): people who left, were removed or deleted their account. Lines, splits and settle-ups keep naming
// them through `user_id` (while the account exists) or the stable `former_key` (after deletion).

import { toDbError } from './errors';
import type { DbClient } from './rows';

export const FORMER_MEMBER_COLUMNS = 'id, household_id, user_id, former_key, display_name, colour_key, name_hidden, reason, left_at';

export interface FormerMemberRow {
  id: string;
  household_id: string;
  /** Null once the account is deleted. */
  user_id: string | null;
  former_key: string;
  /** Null once the account is deleted (the name is erased). */
  display_name: string | null;
  colour_key: number;
  name_hidden: boolean;
  reason: 'left' | 'removed' | 'deleted';
  left_at: string;
}

export async function fetchFormerMembers(client: DbClient, householdId: string): Promise<FormerMemberRow[]> {
  const { data, error, status } = await client
    .from('household_former_members')
    .select(FORMER_MEMBER_COLUMNS)
    .eq('household_id', householdId)
    .order('left_at', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as FormerMemberRow[] | null) ?? [];
}
