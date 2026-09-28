// Cached recurring-series reads (REC-05), household-scoped. Copies
// src/data/queries/accounts.ts's shape exactly -- fetchRecurringSeries already excludes
// soft-deleted series (D-08) and orders by name.
import { useQuery } from '@tanstack/react-query';
import { fetchRecurringSeries } from '@/db/recurringSeries';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useRecurringSeries(householdId?: string) {
  return useQuery({
    queryKey: queryKeys.recurringSeries(householdId ?? ''),
    queryFn: () => fetchRecurringSeries(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
