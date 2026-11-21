// 08.1-22 (CMP-F19): the household's spending rule and setup. Any member reads it; the RPC writes it (any member, named in Notices).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHouseholdSpendRule, setHouseholdSpendRule, type SetSpendRuleArgs } from '@/db/householdSpendRules';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** The saved rule row, or null when none is saved (the setup default applies). */
export function useHouseholdSpendRule(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.householdSpendRule(householdId ?? ''),
    queryFn: () => fetchHouseholdSpendRule(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

export function useSetHouseholdSpendRule(householdId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: SetSpendRuleArgs) => setHouseholdSpendRule(supabase, a),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.householdSpendRule(householdId ?? '') }),
  });
}
