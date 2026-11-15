import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '@/db/accounts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** 06.1-72: a caller may hold the read fresh for longer (Decide's reads use DECIDE_READ_STALE_MS). */
export function useAccounts(householdId?: string, opts?: { staleTime?: number }) {
  return useQuery({
    queryKey: queryKeys.accounts(householdId ?? ''),
    queryFn: () => fetchAccounts(supabase, householdId as string),
    enabled: Boolean(householdId),
    ...opts, // only a given staleTime: an explicit undefined would replace the app default
  });
}
