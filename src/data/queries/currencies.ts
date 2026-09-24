import { useQuery } from '@tanstack/react-query';
import { fetchCurrencies } from '@/db/currencies';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** D-08: the full ~171-currency fx-sync set, essentially never changes within a session. */
export function useCurrencies() {
  return useQuery({
    queryKey: queryKeys.currencies(),
    queryFn: () => fetchCurrencies(supabase),
    staleTime: ONE_DAY_MS,
  });
}
