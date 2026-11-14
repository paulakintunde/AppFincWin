// 06.1-12 (CO-D-64 (6)): "What Decide said on {date}" for one check, newest first. Owner-private under RLS.
import { useQuery } from '@tanstack/react-query';
import { listCheckHistory } from '@/db/decideCheckHistory';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useCheckHistory(userId?: string, checkId?: string) {
  return useQuery({
    queryKey: queryKeys.decideCheckHistory(userId ?? '', checkId ?? ''),
    queryFn: () => listCheckHistory(supabase, checkId as string),
    enabled: Boolean(userId) && Boolean(checkId),
  });
}
