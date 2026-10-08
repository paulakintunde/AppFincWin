import { useQuery } from '@tanstack/react-query';
import { fetchFxLatest } from '@/db/fxRates';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** D-17: what plan 01-12 uses for provisional offline conversion while a write is queued. */
export function useFxLatest() {
  return useQuery({
    queryKey: queryKeys.fxLatest(),
    queryFn: () => fetchFxLatest(supabase),
    staleTime: ONE_HOUR_MS,
  });
}
