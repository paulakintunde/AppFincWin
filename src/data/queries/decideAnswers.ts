// 05.2 (DSU-19, DSU-21): this user's live answers for the household. Owner-private under RLS.
import { useQuery } from '@tanstack/react-query';
import { fetchDecideAnswers } from '@/db/decideAnswers';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useDecideAnswers(userId?: string, householdId?: string) {
  return useQuery({
    queryKey: queryKeys.decideAnswers(userId ?? '', householdId ?? ''),
    queryFn: () => fetchDecideAnswers(supabase, userId as string, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}
