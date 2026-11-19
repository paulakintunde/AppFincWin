// 09-10: the plan_state() read. One cache entry per signed-in user; PlanHost invalidates it on Realtime and on return to the app.
import { useQuery } from '@tanstack/react-query';
import { fetchPlanState } from '@/db/plans';
import type { DbClient } from '@/db/rows';
import { queryKeys } from '../keys';

// The app shell (LockHost) and the write gate import this module, so it must not build the Supabase client at import time:
// that reads EXPO_PUBLIC_* and throws EnvError where they are unset (CI, tests that never fetch). The client is required
// when the query first runs, the same lazy pattern as transactionCache.ts / writeClient.ts.
function lazySupabase(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

export function usePlanStateQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.planState(userId ?? ''),
    queryFn: () => fetchPlanState(lazySupabase()),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
