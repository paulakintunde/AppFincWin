// 05.2 (DSU-05): the household's live "not a recurring" dismissals.
import { useQuery } from '@tanstack/react-query';
import { fetchDismissals } from '@/db/recurringDismissals';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useRecurringDismissals(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.recurringDismissals(householdId ?? ''),
    queryFn: () => fetchDismissals(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
