// SYN-01/SYN-07: the QueryClient singleton used by the whole app, plus the wipe-on-sign-out
// registration (Phase 0 D-15) that clears both the in-memory cache and its encrypted
// persisted copy.
import { QueryClient } from '@tanstack/react-query';
import { registerWipeHandler } from '@/services/storage/wipe';
import { persister } from './cache/persister';
import { bumpSessionEpoch } from './sync/sessionEpoch';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // gcTime must be at least maxAge (CACHE_MAX_AGE_MS, 30 days) or a query restored from
      // the persisted cache is garbage-collected before anything reads it (TanStack
      // persistence docs pitfall). CACHE_MAX_AGE_MS itself cannot be used here: at
      // 2,592,000,000ms it exceeds the 32-bit signed integer max setTimeout accepts
      // (2,147,483,647ms, ~24.8 days) and gets silently clamped to a 1ms timeout, garbage
      // collecting restored queries almost immediately instead of after 30 days. `Infinity`
      // is TanStack Query's documented "never auto-GC" sentinel (isValidTimeout excludes it,
      // so no timer is scheduled at all) and trivially satisfies "at least maxAge". Actual
      // eviction is left to the wipe handler and explicit cache clears, not a GC timer.
      gcTime: Infinity,
      staleTime: 60_000,
      // Serves cached data immediately and still attempts a background fetch when online,
      // rather than the RN-unsafe 'always' default that errors instead of pausing offline
      // (RESEARCH Pattern 6 gotcha; SYN-01).
      networkMode: 'offlineFirst',
      retry: 2,
    },
    mutations: {
      // Per-mutation-key retry policy is set by setMutationDefaults() in plan 01-12; this is
      // only the safe default for any mutation that has not registered its own.
      retry: 0,
    },
  },
});

export const QUERY_WIPE_HANDLER_ID = 'query-cache';

registerWipeHandler({
  id: QUERY_WIPE_HANDLER_ID,
  async wipe() {
    // WR-A09: first, so any write still in flight or in retry backoff settles as discarded
    // instead of writing the previous user's rows back into the cleared cache.
    bumpSessionEpoch();
    queryClient.getMutationCache().clear();
    queryClient.clear();
    await persister.removeClient();
  },
  async pendingWriteCount() {
    // D-19: reported to the unsynced-changes warning so a wipe cannot silently discard a
    // queued write without the user being told.
    return queryClient
      .getMutationCache()
      .getAll()
      .filter((m) => m.state.status === 'pending').length;
  },
});
