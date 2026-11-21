// 08.1-22 (CMP-F19, UX-21): the joint accounts' facts Decide needs (purpose, true balance, this month's totals) and the purpose RPC.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJointAccountMonth, fetchJointBalances, fetchJointPurposes, setJointAccountPurpose, type JointBalanceLeg, type JointMonthRow, type JointPurposeRow, type SetJointPurposeArgs } from '@/db/jointAccounts';
import { monthOf, monthRange } from '@/engine/time';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export interface JointAccountFactsRead {
  purposes: JointPurposeRow[];
  balances: JointBalanceLeg[];
  month: JointMonthRow[];
}

/** One read of everything about the household's joint accounts for the month `today` falls in. */
export async function fetchJointAccountFacts(householdId: string, today: string): Promise<JointAccountFactsRead> {
  const range = monthRange(monthOf(today));
  const [purposes, balances, month] = await Promise.all([
    fetchJointPurposes(supabase, householdId),
    fetchJointBalances(supabase, householdId),
    fetchJointAccountMonth(supabase, householdId, range.start, range.endExclusive),
  ]);
  return { purposes, balances, month };
}

export function useJointAccountFacts(householdId: string | null | undefined, today: string) {
  return useQuery({
    queryKey: queryKeys.jointAccountFacts(householdId ?? '', monthOf(today)),
    queryFn: () => fetchJointAccountFacts(householdId as string, today),
    enabled: Boolean(householdId),
  });
}

export function useSetJointAccountPurpose(householdId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: SetJointPurposeArgs) => setJointAccountPurpose(supabase, a),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts(householdId ?? '') });
      return qc.invalidateQueries({ queryKey: queryKeys.jointAccountFactsRoot(householdId ?? '') });
    },
  });
}
