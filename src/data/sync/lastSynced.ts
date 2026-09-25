import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { registerWipeHandler } from '@/services/storage/wipe';

// D-15: a sync timestamp is not sensitive, so it lives in plain AsyncStorage rather than
// behind LargeSecureStore's encryption (contrast with failedWrites.ts, whose payloads can
// contain amounts and notes).
export const LAST_SYNCED_KEY = 'fincwin:last-synced-at';

let lastSyncedAt: number | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Records the moment the app last had a confirmed successful sync with the server. */
export function markSynced(at: number = Date.now()): void {
  lastSyncedAt = at;
  notify();
  AsyncStorage.setItem(LAST_SYNCED_KEY, String(at)).catch(() => {
    // Best-effort persistence: the in-memory value is already correct for this session
    // even if the write fails, and the next successful sync will retry the write anyway.
  });
}

export function getLastSyncedAt(): number | null {
  return lastSyncedAt;
}

export function subscribeLastSynced(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reads the persisted last-synced timestamp into memory (e.g. on app boot). Corrupt or
 * missing data falls back to null rather than throwing -- this must never crash app boot.
 */
export async function hydrateLastSynced(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNCED_KEY);
    const parsed = raw === null ? null : Number(raw);
    lastSyncedAt = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  } catch {
    lastSyncedAt = null;
  }
  notify();
}

// IN-A03: the AsyncStorage key is already swept by the wipe's fincwin: prefix, but the
// in-memory value is not -- without this the next user on the device would see the
// previous user's "synced N minutes ago" until their own first sync.
registerWipeHandler({
  id: 'last-synced',
  wipe: async () => {
    lastSyncedAt = null;
    notify();
    await AsyncStorage.removeItem(LAST_SYNCED_KEY);
  },
});

/**
 * Marks synced whenever any query fetch or mutation in the given QueryClient succeeds --
 * never on error. Returns a combined unsubscribe function.
 *
 * WR-A07: `setQueryData` also dispatches a query 'success' action, flagged `manual: true`.
 * Every optimistic cache patch goes through it, including while offline, so manual updates
 * are ignored -- only a real fetch that came back from the server counts as a sync.
 */
export function trackSyncActivity(queryClient: QueryClient): () => void {
  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) markSynced();
  });
  const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success') markSynced();
  });
  return () => {
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
