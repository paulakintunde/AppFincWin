// 06-12: reads for Grow's goals. The same cache keys as Decide's pots (savings_goals, goal lines), so a goal made in Grow and a
// pot read by Decide are one set of rows. Derived figures (saved, totals) are never stored in the cache.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchSavingsGoals, type SavingsGoalRow } from '@/db/savingsGoals';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export { useGoalLines } from './decide';

/**
 * Every live goal row of the household (goals, Wait pots, the safety net), oldest first. 06.1-78 (G-72-2): `opts.staleTime` is the
 * observer's freshness (the answer's reads pass five minutes); undefined keeps the app default.
 */
export function useSavingsGoalRows(userId?: string, householdId?: string, opts?: { staleTime?: number }): UseQueryResult<SavingsGoalRow[]> {
  return useQuery({
    queryKey: queryKeys.savingsGoals(userId ?? '', householdId ?? ''),
    queryFn: () => fetchSavingsGoals(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
    ...(opts?.staleTime === undefined ? {} : { staleTime: opts.staleTime }),
  });
}
