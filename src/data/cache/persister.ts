// SYN-01/SYN-07/D-15: the TanStack Query cache persists to AsyncStorage through
// LargeSecureStore (Phase 0), so the on-disk blob is AES-CTR ciphertext with its key in
// SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY) — no new crypto code, per Don't Hand-Roll.
import { AppState } from 'react-native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import type { Mutation, Query, QueryClient } from '@tanstack/react-query';
import { addBreadcrumb } from '@sentry/react-native';
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
//
// C-WR-07: a mismatch discards the cached *queries* only. The queued offline writes in the same
// blob are carried across (carryQueuedWrites below) -- they are user-authored changes that must
// survive an upgrade (SYN-02), including an EAS Update OTA. The constraint that buys this:
// a registered mutation's variables shape must stay readable by the next build's mutationFn
// (add fields as optional; never rename or remove one a queued write may still carry).
// Phase 2 added transaction fields (including import provenance and transfer links) and new
// query shapes -- bumped 1 -> 2 (D-15 buster).
export const CACHE_SCHEMA_VERSION = '2';

/**
 * IN-A05: when each query last got data *from the server*, keyed by queryHash. D-15's
 * "30 days without a successful refetch" cannot use `state.dataUpdatedAt`, because every
 * optimistic setQueryData moves it too -- a month that is only ever written to offline would
 * otherwise stay persisted indefinitely. Kept alongside the persisted blob (serialize /
 * deserialize below) so it survives restarts.
 */
const serverFetchedAt = new Map<string, number>();

/** The last server fetch for `q`, falling back to dataUpdatedAt for a query with no record. */
export function lastServerFetchAt(q: Query): number {
  return serverFetchedAt.get(q.queryHash) ?? q.state.dataUpdatedAt;
}

/** Records real fetches (never manual setQueryData updates). Returns an unsubscribe function. */
export function trackServerFetches(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) {
      serverFetchedAt.set(event.query.queryHash, event.action.dataUpdatedAt ?? Date.now());
    } else if (event.type === 'removed') {
      serverFetchedAt.delete(event.query.queryHash);
    }
  });
}

/** Sign-out wipe / tests. */
export function clearServerFetchTimes(): void {
  serverFetchedAt.clear();
}

const SERVER_FETCHED_FIELD = 'fincwinServerFetchedAt';

// F-11: Android reads an AsyncStorage row through a 2 MB CursorWindow. LargeSecureStore writes the
// ciphertext as hex (about 2x the UTF-8 bytes) plus a 33-character iv prefix, so the plaintext
// JSON must stay well under 1 MB. 900 KB leaves room for the prefix and the fetch-times field.
export const MAX_PERSIST_BYTES = 900 * 1024;

// Room kept for the fetch-times field and the persisted-client envelope when deciding whether the
// queued writes fit in the main row.
const MAIN_ROW_RESERVE_BYTES = 16 * 1024;

// F-11: queued writes that alone exceed the budget live in separate rows under this prefix.
export const WRITES_OVERFLOW_PREFIX = `${QUERY_CACHE_KEY}:writes:`;

// Large reads that refetch on the next open: not worth the bytes (F-11).
const NEVER_PERSIST = new Set(['offer-history', 'search', 'refund-links', 'refund-purchases']);

export function isNeverPersisted(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'transactions' && NEVER_PERSIST.has(String(queryKey[2]));
}

function utf8Length(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * F-11: keeps the serialised client under `maxBytes` by dropping whole queries, largest first.
 * Mutations (queued offline writes) are never touched (SYN-02). Returns the same object when it
 * already fits.
 */
export function fitToBudget(
  client: PersistedClient,
  maxBytes: number,
  size: (s: string) => number = utf8Length
): PersistedClient {
  let total = size(JSON.stringify(client));
  if (total <= maxBytes) return client;
  const queries = client.clientState.queries.map((q) => ({ q, bytes: size(JSON.stringify(q)) }));
  queries.sort((a, b) => b.bytes - a.bytes);
  let dropped = 0;
  while (dropped < queries.length && total > maxBytes) {
    total -= (queries[dropped]?.bytes ?? 0) + 1;
    dropped++;
  }
  const keep = new Set(queries.slice(dropped).map((e) => e.q));
  return {
    ...client,
    clientState: { ...client.clientState, queries: client.clientState.queries.filter((q) => keep.has(q)) },
  };
}

export function serializeWithFetchTimes(client: PersistedClient): string {
  // Only persisted queries need their fetch times on disk (the map also holds never-persisted reads).
  const times: Record<string, number> = {};
  for (const q of client.clientState.queries) {
    const at = serverFetchedAt.get(q.queryHash);
    if (at !== undefined) times[q.queryHash] = at;
  }
  const kept = fitToBudget(client, MAX_PERSIST_BYTES - utf8Length(JSON.stringify(times)) - 64);
  if (kept !== client) {
    const hashes = new Set(kept.clientState.queries.map((q) => q.queryHash));
    for (const h of Object.keys(times)) if (!hashes.has(h)) delete times[h];
  }
  return JSON.stringify({ ...kept, [SERVER_FETCHED_FIELD]: times });
}

export function deserializeWithFetchTimes(raw: string): PersistedClient {
  const parsed = JSON.parse(raw) as PersistedClient & { [SERVER_FETCHED_FIELD]?: Record<string, unknown> };
  const times = parsed[SERVER_FETCHED_FIELD];
  if (times && typeof times === 'object') {
    for (const [hash, at] of Object.entries(times)) {
      if (typeof at === 'number' && Number.isFinite(at)) serverFetchedAt.set(hash, at);
    }
  }
  delete parsed[SERVER_FETCHED_FIELD];
  return parsed;
}

/**
 * C-WR-07: persistQueryClientRestore removes the whole persisted client when its buster does
 * not match (or it is older than maxAge) -- and the dehydrated write queue lives in that same
 * client. A blob that still holds queued writes is therefore rewritten to the current buster
 * and a fresh timestamp with its queries dropped (their shape may be stale) and its mutations
 * kept, so the restore hydrates the queue and resumeRestoredMutations replays it. A blob with
 * no queued writes, or a current one, is returned unchanged.
 */
export function carryQueuedWrites(
  client: PersistedClient | undefined,
  buster: string,
  maxAge: number,
  now: number = Date.now()
): PersistedClient | undefined {
  if (!client) return client;
  const mutations = client.clientState?.mutations ?? [];
  const current = client.buster === buster && now - client.timestamp <= maxAge;
  if (current || mutations.length === 0) return client;
  return { timestamp: now, buster, clientState: { queries: [], mutations } };
}

function createBasePersister(storage: LargeSecureStore, throttleTime: number) {
  // storage is typed as LargeSecureStore only to give callers autocomplete/defaulting;
  // createAsyncStoragePersister's storage param wants the AsyncStorage-shaped
  // getItem/setItem/removeItem interface, which LargeSecureStore already implements.
  return createAsyncStoragePersister({
    storage,
    key: QUERY_CACHE_KEY,
    throttleTime,
    serialize: serializeWithFetchTimes,
    deserialize: deserializeWithFetchTimes,
  });
}

type Mutations = PersistedClient['clientState']['mutations'];
type WithChunks = PersistedClient & { writesChunks?: number };

/** Splits the queued writes, in order, into groups whose JSON each fits `maxBytes`. */
function chunkMutations(mutations: Mutations, maxBytes: number) {
  const chunks: Mutations[] = [];
  let current: Mutations = [];
  let currentBytes = 2;
  let oversizedSingle = 0;
  for (const m of mutations) {
    const bytes = utf8Length(JSON.stringify(m)) + 1;
    if (bytes + 2 > maxBytes) oversizedSingle = 1;
    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(m);
    currentBytes += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return { chunks, oversizedSingle };
}

export function createEncryptedPersister(
  storage: LargeSecureStore = new LargeSecureStore(),
  throttleTime = 1000
): Persister {
  const base = createBasePersister(storage, throttleTime);

  // Removes overflow rows from index `start` upward (stops at the first gap).
  async function removeOverflowFrom(start: number): Promise<void> {
    for (let i = start; ; i++) {
      const key = WRITES_OVERFLOW_PREFIX + i;
      if ((await storage.getItem(key)) === null) return;
      await storage.removeItem(key);
    }
  }

  return {
    persistClient: async (client: PersistedClient) => {
      const mutations = client.clientState.mutations;
      const mutationBytes = mutations.length > 0 ? utf8Length(JSON.stringify(mutations)) : 0;
      let toSave: WithChunks = client;
      if (mutationBytes > MAX_PERSIST_BYTES - MAIN_ROW_RESERVE_BYTES) {
        const { chunks, oversizedSingle } = chunkMutations(mutations, MAX_PERSIST_BYTES);
        for (let i = 0; i < chunks.length; i++) {
          await storage.setItem(WRITES_OVERFLOW_PREFIX + i, JSON.stringify(chunks[i]));
        }
        await removeOverflowFrom(chunks.length);
        addBreadcrumb({
          category: 'persist',
          message: 'queued writes over budget',
          data: { mutations: mutations.length, chunks: chunks.length, bytes: mutationBytes, oversizedSingle },
        });
        toSave = { ...client, clientState: { queries: [], mutations: [] }, writesChunks: chunks.length };
      } else {
        await removeOverflowFrom(0);
      }
      if (__DEV__) {
        const bytes = utf8Length(serializeWithFetchTimes(toSave));
        console.log(
          `[persist] bytes=${bytes} queries=${toSave.clientState.queries.length} mutations=${mutations.length}`
        );
      }
      await base.persistClient(toSave);
    },
    removeClient: async () => {
      await base.removeClient();
      await removeOverflowFrom(0);
    },
    restoreClient: async () => {
      const restored = (await base.restoreClient()) as WithChunks | undefined;
      if (restored && typeof restored.writesChunks === 'number' && restored.writesChunks > 0) {
        const mutations: Mutations = [];
        for (let i = 0; i < restored.writesChunks; i++) {
          const raw = await storage.getItem(WRITES_OVERFLOW_PREFIX + i);
          if (raw) mutations.push(...(JSON.parse(raw) as Mutations));
        }
        restored.clientState = { ...restored.clientState, mutations };
        delete restored.writesChunks;
      }
      return carryQueuedWrites(restored, CACHE_SCHEMA_VERSION, CACHE_MAX_AGE_MS);
    },
  };
}

export const persister = createEncryptedPersister();

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_SCHEMA_VERSION,
  dehydrateOptions: {
    // D-15: browsable for 30 days WITHOUT a successful refetch. IN-A05: measured from the last
    // server fetch, not dataUpdatedAt (which optimistic writes also move), so a query older
    // than that is simply not persisted and is gone on the next boot.
    shouldDehydrateQuery: (q: Query) => q.state.status === 'success' &&
      !isNeverPersisted(q.queryKey) &&
      Date.now() - lastServerFetchAt(q) < CACHE_MAX_AGE_MS,
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

let immediate: Persister | null = null;

/**
 * D-77 (R9): the main persister throttles writes to once a second, so a write queued less than a second before the OS
 * kills the app could be lost. This saves the client now, through an unthrottled persister over the same encrypted storage,
 * key and serializer (no new store). Errors are swallowed: a failed flush leaves the throttled write to land as before.
 */
export async function flushPersistedClient(qc: QueryClient): Promise<void> {
  try {
    immediate ??= createEncryptedPersister(new LargeSecureStore(), 0);
    await persistQueryClientSave({
      queryClient: qc,
      persister: immediate,
      buster: CACHE_SCHEMA_VERSION,
      dehydrateOptions: persistOptions.dehydrateOptions,
    });
  } catch {
    // The throttled persister remains the fallback.
  }
}

/**
 * Persists the write queue as the app leaves the foreground. The flush runs on the next tick, so a screen's own AppState
 * handler (useCheckDraft, registered later) has queued its mutation first. Returns an unsubscribe.
 */
export function startPersistOnBackground(qc: QueryClient): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') setTimeout(() => void flushPersistedClient(qc), 0);
  });
  return () => sub.remove();
}
