// MON-14: transactions are fetched per local month via db/transactions.ts's own
// monthRange-bounded query, never filtered on created_at.
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionsForMonth } from '@/db/transactions';
import { supabase } from '@/services/supabase';
import type { TransactionRow } from '@/db/rows';
import { queryKeys } from '../keys';
import type { WithPending } from '../types';

export function useTransactionsForMonth(householdId?: string, month?: string) {
  return useQuery<WithPending<TransactionRow>[]>({
    queryKey: queryKeys.transactionsMonth(householdId ?? '', month ?? ''),
    queryFn: () => fetchTransactionsForMonth(supabase, householdId as string, month as string),
    enabled: Boolean(householdId) && Boolean(month),
  });
}
