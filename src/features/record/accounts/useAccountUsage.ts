// REC-24: live-line and active-series counts for one account, for the delete-or-archive footer.
// Keyed under transactionsRoot so any transaction or series write refreshes it. While unknown
// (loading, offline, error) `usage` is null and the footer never guesses.
import { useQuery } from '@tanstack/react-query';
import { fetchAccountUsageCounts, type AccountUsageCounts } from '@/db/accounts';
import { queryKeys } from '@/data/keys';
import { useRecordContext } from '@/features/record/useRecordContext';
import { supabase } from '@/services/supabase';

export function useAccountUsage(accountId: string): { usage: AccountUsageCounts | null } {
  const rc = useRecordContext();
  const householdId = rc.householdId;
  const query = useQuery({
    queryKey: [...queryKeys.transactionsRoot(householdId ?? ''), 'account-usage', accountId],
    queryFn: () => fetchAccountUsageCounts(supabase, householdId as string, accountId, rc.today),
    enabled: Boolean(householdId),
  });
  return { usage: query.data ?? null };
}
