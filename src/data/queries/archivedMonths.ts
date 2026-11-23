// 10-03 (DAT-01): the months the person has archived, as 'YYYY-MM', newest first.
import { useQuery } from '@tanstack/react-query';
import { fetchArchivedMonths } from '@/db/archivedMonths';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useArchivedMonths(userId?: string) {
  return useQuery({
    queryKey: queryKeys.archivedMonths(userId ?? ''),
    queryFn: () => fetchArchivedMonths(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: FIVE_MINUTES,
  });
}
