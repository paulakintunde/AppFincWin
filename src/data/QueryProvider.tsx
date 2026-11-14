// SYN-01/SYN-02/SYN-07: wires the persisted cache and the paused-mutation write queue into
// the app. Mounting this in app/_layout.tsx is plan 01-15's job (that file is owned by Phase
// 0 plan 00-17) -- this module only exports the provider and does its module-scope wiring.
//
// Pitfall 3 (RESEARCH.md): every setMutationDefaults registration must happen before
// PersistQueryClientProvider restores the persisted cache, or a paused mutation resumed from
// disk has no function to call and silently never resumes. registerMutationDefaults runs at
// module scope below -- imported once, before this component's first render -- rather than
// inside the component body or an effect.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IsRestoringProvider, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import {
  persistOptions,
  resumeRestoredMutations,
  startPersistOnBackground,
  startThrottledPersist,
  trackServerFetches,
} from './cache/persister';
import { queryClient } from './queryClient';
import { afterCacheRestore, startOnlineManager } from './onlineManager';
import { registerMutationDefaults } from './mutations';
import { captureFailedWrite } from '@/services/errors';
import { hydrateFailedWrites, setFailureReporter } from './sync/failedWrites';
import { hydrateLastSynced, trackSyncActivity } from './sync/lastSynced';
import { startRatePendingSweep } from './sync/ratePendingSweep';
import { startCacheProbe } from './perf/cacheProbe';

registerMutationDefaults(queryClient);
startPersistOnBackground(queryClient); // D-77: the write queue hits disk the moment the app backgrounds
startOnlineManager(queryClient);
startRatePendingSweep(queryClient); // 02-47: retries rate_pending lines and failed account rate checks
trackSyncActivity(queryClient);
trackServerFetches(queryClient); // IN-A05
setFailureReporter(captureFailedWrite); // entity, kind and code only; never the payload
void hydrateFailedWrites();
void hydrateLastSynced();
startCacheProbe(queryClient); // 06.1-73: a no-op unless EXPO_PUBLIC_PERF=1

/**
 * 06.1-73 (DB-1): PersistQueryClientProvider's behaviour (restore once, IsRestoring while it runs, then persist on change)
 * with one difference: the persist subscription is startThrottledPersist, which dehydrates once per throttle window instead
 * of on every cache event. The restore, maxAge, buster and dehydrate options are the same persistOptions as before.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [isRestoring, setIsRestoring] = useState(true);
  const didRestore = useRef(false);

  useEffect(() => {
    if (!didRestore.current) {
      didRestore.current = true;
      persistQueryClientRestore({ ...persistOptions, queryClient })
        .then(() => {
          // The persisted cache has been restored; every mutation key now has real code to
          // resume with (registered above), so it's safe to replay the write queue in order.
          // WR-A13: every restored pending write, not only the paused ones.
          // D-88: the refetch starts at once, in parallel with the replay; it never waits for writes.
          afterCacheRestore(queryClient, resumeRestoredMutations);
        })
        .catch(() => undefined)
        .finally(() => setIsRestoring(false));
    }
    return isRestoring ? undefined : startThrottledPersist(queryClient);
  }, [isRestoring]);

  return (
    <QueryClientProvider client={queryClient}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
}
