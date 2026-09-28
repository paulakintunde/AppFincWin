// Cached undo-history reads (REC-11, D-25), per user. Copies
// src/data/queries/accounts.ts's shape exactly -- fetchUndoLog already scopes to the 12
// newest available-or-refused steps, newest first.
import { useQuery } from '@tanstack/react-query';
import { fetchUndoLog } from '@/db/undoLog';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useUndoLog(userId?: string) {
  return useQuery({
    queryKey: queryKeys.undoLog(userId ?? ''),
    queryFn: () => fetchUndoLog(supabase, userId as string),
    enabled: Boolean(userId),
  });
}
