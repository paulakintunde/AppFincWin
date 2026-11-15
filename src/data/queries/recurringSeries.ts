// Cached recurring-series reads (REC-05), household-scoped. Copies
// src/data/queries/accounts.ts's shape exactly -- fetchRecurringSeries already excludes
// soft-deleted series (D-08) and orders by name.
import { useQuery } from '@tanstack/react-query';
import { fetchRecurringSeries } from '@/db/recurringSeries';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** 06.1-72: a caller may hold the read fresh for longer (Decide's reads use DECIDE_READ_STALE_MS). */
export function useRecurringSeries(householdId?: string, opts?: { staleTime?: number }) {
  return useQuery({
    queryKey: queryKeys.recurringSeries(householdId ?? ''),
    queryFn: () => fetchRecurringSeries(supabase, householdId as string),
    enabled: Boolean(householdId),
    ...opts, // only a given staleTime: an explicit undefined would replace the app default
  });
}
