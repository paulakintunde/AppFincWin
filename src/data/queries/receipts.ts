// 10.1-11 (RCP-01): the receipt rows of one line. Rows only (ids, paths, kinds, sizes): signed links to the files are made on
// demand when a receipt is opened and are never stored here, so nothing short-lived or secret reaches the persisted cache.
import { useQuery } from '@tanstack/react-query';
import { listReceipts } from '@/db/receipts';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useReceipts(householdId?: string, transactionId?: string, opts?: { staleTime?: number }) {
  return useQuery({
    queryKey: queryKeys.receipts(householdId ?? '', transactionId ?? ''),
    queryFn: () => listReceipts(supabase, [transactionId as string]),
    enabled: Boolean(householdId) && Boolean(transactionId),
    ...opts,
  });
}
