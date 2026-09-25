// SYN-01/SYN-07/D-15: the TanStack Query cache persists to AsyncStorage through
// LargeSecureStore (Phase 0), so the on-disk blob is AES-CTR ciphertext with its key in
// SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY) — no new crypto code, per Don't Hand-Roll.
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import type { Mutation, Query, QueryClient } from '@tanstack/react-query';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore';

// Kept under the fincwin: prefix so wipeDeviceData's AsyncStorage sweep (src/services/storage/wipe.ts)
// catches the persisted blob even if the registered wipe handler below somehow does not run.
export const QUERY_CACHE_KEY = 'fincwin:query-cache';

// D-15: cached data not refreshed successfully in 30 days is not persisted, so it is gone on
// the next boot rather than shown stale-and-silent.
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// D-15: bump this whenever any cached row shape changes. persistQueryClient compares this
// against the buster stored alongside the persisted blob and discards on mismatch, so an
// app upgrade never hydrates the client with a shape it no longer expects.
export const CACHE_SCHEMA_VERSION = '1';

export function createEncryptedPersister(storage: LargeSecureStore = new LargeSecureStore()): Persister {
  // storage is typed as LargeSecureStore above only to give callers autocomplete/defaulting;
  // createAsyncStoragePersister's storage param wants the AsyncStorage-shaped
  // getItem/setItem/removeItem interface, which LargeSecureStore already implements.
  return createAsyncStoragePersister({ storage, key: QUERY_CACHE_KEY, throttleTime: 1000 });
}

export const persister = createEncryptedPersister();

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_SCHEMA_VERSION,
  dehydrateOptions: {
    // D-15: browsable for 30 days WITHOUT a successful refetch. dataUpdatedAt only moves on
    // success, so a query older than that is simply not persisted and is gone on the next boot.
    shouldDehydrateQuery: (q: Query) => q.state.status === 'success' && Date.now() - q.state.dataUpdatedAt < CACHE_MAX_AGE_MS,
    // WR-A13: every unfinished write survives a restart, not only paused ones. A write that
    // was mid-attempt or waiting out a retry backoff when the app was killed has
    // `isPaused: false`; persisting only paused writes left its optimistic row on disk with
    // nothing behind it, and the next refetch then dropped the entry silently.
    // resumeRestoredMutations (below) replays them; inserts are idempotent through the
    // duplicate-id path and a replayed edit that already landed resolves as applied.
    shouldDehydrateMutation: (m: Mutation) => m.state.status === 'pending',
  },
};

/**
 * WR-A13: replays every restored, still-pending write in its original order. query-core's
 * resumePausedMutations only picks up `isPaused` mutations, so a write that was in flight
 * when the app died would otherwise sit restored-but-idle forever. Mutation.continue() runs
 * a restored pending mutation again without re-running onMutate.
 */
export function resumeRestoredMutations(queryClient: QueryClient): Promise<void> {
  const pending = queryClient
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === 'pending');
  return Promise.all(pending.map((m) => m.continue().catch(() => undefined))).then(() => undefined);
}
