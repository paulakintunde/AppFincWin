// SYN-01/SYN-02/SYN-07: wires the persisted cache and the paused-mutation write queue into
// the app. Mounting this in app/_layout.tsx is plan 01-15's job (that file is owned by Phase
// 0 plan 00-17) -- this module only exports the provider and does its module-scope wiring.
//
// Pitfall 3 (RESEARCH.md): every setMutationDefaults registration must happen before
// PersistQueryClientProvider restores the persisted cache, or a paused mutation resumed from
// disk has no function to call and silently never resumes. registerMutationDefaults runs at
// module scope below -- imported once, before this component's first render -- rather than
// inside the component body or an effect.
import type { ReactNode } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persistOptions } from './cache/persister';
import { queryClient } from './queryClient';
import { startOnlineManager } from './onlineManager';
import { registerMutationDefaults } from './mutations';
import { hydrateFailedWrites } from './sync/failedWrites';
import { hydrateLastSynced, trackSyncActivity } from './sync/lastSynced';

registerMutationDefaults(queryClient);
startOnlineManager();
trackSyncActivity(queryClient);
void hydrateFailedWrites();
void hydrateLastSynced();

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // The persisted cache has been restored; every mutation key now has real code to
        // resume with (registered above), so it's safe to replay the write queue in order.
        void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
