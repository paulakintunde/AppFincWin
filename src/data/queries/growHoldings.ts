// 06-14 (GRW-10): reads for Grow's investments. Holdings and their entries are owner-private (20261106000100), so both keys
// carry the user id. Derived figures (gain, totals, staleness) are never stored in the cache.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchHoldingLots, type HoldingLotRow } from '@/db/holdingLots';
import { fetchHoldings, type HoldingRow } from '@/db/holdings';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** Every live holding of the household, oldest first. */
export function useHoldingRows(userId?: string, householdId?: string): UseQueryResult<HoldingRow[]> {
  return useQuery({
    queryKey: queryKeys.holdings(userId ?? '', householdId ?? ''),
    queryFn: () => fetchHoldings(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

/** Every live entry (buy, sell, dividend, fee, value) of the household's holdings, by date. */
export function useHoldingLotRows(userId?: string, householdId?: string): UseQueryResult<HoldingLotRow[]> {
  return useQuery({
    queryKey: queryKeys.holdingLots(userId ?? '', householdId ?? ''),
    queryFn: () => fetchHoldingLots(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}
