// D-07: a user's own custom currencies, owner-isolated by RLS server-side and keyed by
// userId here so one user's cache entry never leaks into another's.
import { useQuery } from '@tanstack/react-query';
import { fetchCustomCurrencies } from '@/db/customCurrencies';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useCustomCurrencies(userId?: string) {
  return useQuery({
    queryKey: queryKeys.customCurrencies(userId ?? ''),
    queryFn: () => fetchCustomCurrencies(supabase, userId as string),
    enabled: Boolean(userId),
  });
}
