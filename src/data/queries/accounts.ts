import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '@/db/accounts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useAccounts(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.accounts(householdId ?? ''),
    queryFn: () => fetchAccounts(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
