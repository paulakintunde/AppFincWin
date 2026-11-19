// 09-10: the plan_state() read. One cache entry per signed-in user; PlanHost invalidates it on Realtime and on return to the app.
import { useQuery } from '@tanstack/react-query';
import { fetchPlanState } from '@/db/plans';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function usePlanStateQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.planState(userId ?? ''),
    queryFn: () => fetchPlanState(supabase),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
