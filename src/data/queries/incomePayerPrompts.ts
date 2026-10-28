// 05.2 (DSU-15): the household's live income payer answers.
import { useQuery } from '@tanstack/react-query';
import { fetchPayerPrompts } from '@/db/incomePayerPrompts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useIncomePayerPrompts(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.incomePayerPrompts(householdId ?? ''),
    queryFn: () => fetchPayerPrompts(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
