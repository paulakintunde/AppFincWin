// 06.1-71 (OQ-71-1 B): profiles.region_subdivision for You > Region. The same query key and read Decide's inputs use
// (data/queries/decide.ts), so a change on You shows on the Price step at once and the other way round.
import { useQuery } from '@tanstack/react-query';
import { fetchRegionSubdivision } from '@/db/profile';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** The stored state or province, or null when none is set (or the read has not landed). */
export function useRegionSubdivision(userId?: string): string | null {
  const q = useQuery({
    queryKey: queryKeys.regionSubdivision(userId ?? ''),
    queryFn: () => fetchRegionSubdivision(supabase, userId as string),
    enabled: Boolean(userId),
  });
  return q.data ?? null;
}
