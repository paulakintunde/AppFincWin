// MON-14: transactions are fetched per local month via db/transactions.ts's own
// monthRange-bounded query, never filtered on created_at.
import { useQuery } from '@tanstack/react-query';
import { fetchLinkedFees, fetchTransactionsForMonth } from '@/db/transactions';
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

/** D-32: the bank-fee lines linked to a statement purchase. Reads stored rows only (D-31). */
export function useLinkedFees(householdId: string | null | undefined, row: Pick<TransactionRow, 'id' | 'conversion_source'> | null) {
  return useQuery<TransactionRow[]>({
    queryKey: queryKeys.linkedFees(householdId ?? '', row?.id ?? ''),
    queryFn: () => fetchLinkedFees(supabase, householdId as string, (row as { id: string }).id),
    enabled: Boolean(householdId) && row?.conversion_source === 'statement',
  });
}
