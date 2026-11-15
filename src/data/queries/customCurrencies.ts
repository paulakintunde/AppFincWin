// D-07: a user's own custom currencies, owner-isolated by RLS server-side and keyed by
// userId here so one user's cache entry never leaks into another's.
import { useQuery } from '@tanstack/react-query';
import { fetchCustomCurrencies } from '@/db/customCurrencies';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** 06.1-72: a caller may hold the read fresh for longer (Decide's reads use DECIDE_READ_STALE_MS). */
export function useCustomCurrencies(userId?: string, opts?: { staleTime?: number }) {
  return useQuery({
    queryKey: queryKeys.customCurrencies(userId ?? ''),
    queryFn: () => fetchCustomCurrencies(supabase, userId as string),
    enabled: Boolean(userId),
    ...opts, // only a given staleTime: an explicit undefined would replace the app default
  });
}
