// Pending in/out split and the paid-before-a-date totals (plan 18 RPCs). Read paths never
// fetch exchange rates (02-48 rule): unconverted legs are reported, not resolved here.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAccountPaidBefore,
  fetchAccountPendingSplit,
  type AccountPaidBeforeRow,
  type AccountPendingSplitRow,
} from '@/db/recordReads';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function usePendingSplit(householdId: string | null | undefined): {
  split: ReadonlyMap<string, AccountPendingSplitRow>;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.pendingSplit(householdId ?? ''),
    queryFn: () => fetchAccountPendingSplit(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  const split = useMemo(() => {
    const map = new Map<string, AccountPendingSplitRow>();
    for (const row of query.data ?? []) map.set(`${row.accountId}:${row.currency}`, row);
    return map;
  }, [query.data]);
  return { split, isLoading: query.isLoading };
}

export function usePaidBefore(
  householdId: string | null | undefined,
  before: string | null
): { legs: AccountPaidBeforeRow[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.paidBefore(householdId ?? '', before ?? ''),
    queryFn: () => fetchAccountPaidBefore(supabase, householdId as string, before as string),
    enabled: Boolean(householdId) && before !== null,
  });
  const legs = useMemo(() => query.data ?? [], [query.data]);
  return { legs, isLoading: query.isLoading };
}
