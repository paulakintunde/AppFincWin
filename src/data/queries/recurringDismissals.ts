// 05.2 (DSU-05): the household's live "not a recurring" dismissals.
import { useQuery } from '@tanstack/react-query';
import { fetchDismissals } from '@/db/recurringDismissals';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { DECIDE_READ_STALE_MS } from './decideStale';

export function useRecurringDismissals(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.recurringDismissals(householdId ?? ''),
    queryFn: () => fetchDismissals(supabase, householdId as string),
    enabled: Boolean(householdId),
    // 06.1-72 (G-73-1): a Decide-only read; a write still invalidates it at once.
    staleTime: DECIDE_READ_STALE_MS,
  });
}
