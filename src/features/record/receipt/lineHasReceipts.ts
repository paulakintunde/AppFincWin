// 10.1-23 (D-08, T-10.1-23-03): does this line have receipts? Asked before a line is deleted, so its confirmation can say
// "Its receipts are deleted too." The cached receipts of the line answer at once; with none cached and the phone online, the
// server is asked for that one line; offline and not cached, the answer is unknown (null) and the prompt stays as it was.
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import type { ReceiptRow } from '@/db/receipts';

export function lineHasReceipts(
  qc: QueryClient | undefined,
  householdId: string,
  lineId: string
): boolean | null | Promise<boolean | null> {
  const cached = qc?.getQueryData<ReceiptRow[]>(queryKeys.receipts(householdId, lineId));
  if (cached !== undefined) return cached.length > 0;
  if (!onlineManager.isOnline()) return null;
  // Loaded on first use, so screens that never delete a line never pull the database client in.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { listReceipts } = require('@/db/receipts') as typeof import('@/db/receipts');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { supabase } = require('@/services/supabase') as typeof import('@/services/supabase');
  return listReceipts(supabase, [lineId])
    .then((rows) => rows.length > 0)
    .catch(() => null);
}
