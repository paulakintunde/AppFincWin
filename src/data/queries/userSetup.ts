// 09-13: the person's own level/answers row and feature switches. Private (own-row RLS); not lock-gated, so reads work while locked.
import { useQuery } from '@tanstack/react-query';
import { fetchFeatureSwitches, fetchUserSetup } from '@/db/userSetup';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useUserSetupQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.userSetup(userId ?? ''),
    queryFn: () => fetchUserSetup(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: FIVE_MINUTES,
  });
}

export function useFeatureSwitches(userId?: string) {
  return useQuery({
    queryKey: queryKeys.featureSwitches(userId ?? ''),
    queryFn: () => fetchFeatureSwitches(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: FIVE_MINUTES,
  });
}
