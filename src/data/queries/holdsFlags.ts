// 09-22 (D-34): the four probes with no existing cached read. Persisted like any query; a transaction write refreshes it.
import { useQuery } from '@tanstack/react-query';
import { fetchHoldsFlags } from '@/db/holdsData';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useHoldsFlags(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.holdsFlags(householdId ?? ''),
    queryFn: () => fetchHoldsFlags(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
