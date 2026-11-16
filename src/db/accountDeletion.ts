// 08-22 (HH-14, D-27, D-29): what deleting the account would do to a shared household, read from the server so the paragraph
// on the Delete my account screen is never guessed on the device.
import { toDbError } from './errors';
import type { DbClient } from './rows';

export interface AccountDeletionPreview {
  in_shared_household: boolean;
  is_owner: boolean;
  /** The member who becomes owner when an owner deletes; null for a non-owner or a household of one. */
  next_owner_user_id: string | null;
  household_name: string | null;
}

export async function fetchAccountDeletionPreview(client: DbClient): Promise<AccountDeletionPreview> {
  const { data, error, status } = await client.rpc('account_deletion_preview');
  if (error) throw toDbError(error, status);
  const d = (data ?? {}) as Partial<AccountDeletionPreview>;
  return {
    in_shared_household: d.in_shared_household === true,
    is_owner: d.is_owner === true,
    next_owner_user_id: d.next_owner_user_id ?? null,
    household_name: d.household_name ?? null,
  };
}
