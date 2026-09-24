// D-06: one household in v1 -- this hook reads the membership row Phase 0's
// handle_new_user() trigger provisions at signup and treats it as effectively immutable
// (staleTime Infinity); nothing in Phase 1 changes which household a user belongs to.
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentHouseholdId } from '@/db/household';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useHouseholdId(userId?: string) {
  return useQuery({
    queryKey: queryKeys.household(userId ?? ''),
    queryFn: () => fetchCurrentHouseholdId(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });
}
