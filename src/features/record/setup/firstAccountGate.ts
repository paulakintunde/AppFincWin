// D-22: a signed-in user with no active account is taken to create their first one before
// anything else in Record. Pure so the rule is tested without React. The gate never fires while
// data is loading or when the read errored (offline with nothing cached) so a user is never
// trapped behind a screen they cannot complete (T-02-30-02).
import type { AccountRow } from '@/db/rows';

export interface FirstAccountInput {
  loading: boolean;
  isError?: boolean;
  accounts?: readonly Pick<AccountRow, 'archived_at'>[];
}

export function needsFirstAccount({ loading, isError = false, accounts }: FirstAccountInput): boolean {
  if (loading || isError || accounts === undefined) return false;
  return accounts.every((a) => a.archived_at !== null);
}
