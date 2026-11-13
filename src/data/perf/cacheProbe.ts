/**
 * 06.1-73 (DB-1 / H-11b): perf-only counters for the time after a write. Every function is a no-op unless the build was
 * made with EXPO_PUBLIC_PERF=1 (perfEnabled). It counts, per query-key NAME (queryKey[0] only, never an id, amount or
 * input): query-cache events by type, fetch starts and invalidations; mutation-cache events; persister dehydrate, serialise,
 * encrypt and store milliseconds plus bytes; React Profiler commits per screen id. It logs `PERF probe <name> n=<count>
 * ms=<total>` lines and `PERF idle_after_write ms=<ms>` (from a write settling to the last cache event before 5 s of quiet).
 */
import type { QueryClient } from '@tanstack/react-query';
import { perfDump, perfEnabled } from '@/features/decide/perf/perfMarks';

/** How long the caches must be quiet after a write before the app counts as idle. */
export const IDLE_QUIET_MS = 5_000;
/** How often a running probe logs its counters (only when something changed). */
export const REPORT_EVERY_MS = 10_000;

interface Stat {
  n: number;
  ms: number;
}

const stats = new Map<string, Stat>();
// Names changed since the last report: the running probe logs only these, so its own logging stays small.
const dirty = new Set<string>();
let changed = false;
let settledAt: number | null = null;
let lastEventAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function add(name: string, ms = 0): void {
  const s = stats.get(name) ?? { n: 0, ms: 0 };
  s.n += 1;
  s.ms += ms;
  stats.set(name, s);
  dirty.add(name);
  changed = true;
}

function keyName(queryKey: readonly unknown[] | undefined): string {
  const head = queryKey?.[0];
  return typeof head === 'string' ? head : 'unknown';
}

function noteCacheEvent(): void {
  lastEventAt = Date.now();
  if (settledAt === null) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (settledAt === null) return;
    console.log(`PERF idle_after_write ms=${Math.max(0, lastEventAt - settledAt)}`);
    settledAt = null;
  }, IDLE_QUIET_MS);
}

/** Subscribes the counters to `qc`'s caches. Returns a stop function; a no-op (and a no-op stop) when perf is off. */
export function startCacheProbe(qc: QueryClient): () => void {
  if (!perfEnabled()) return () => undefined;
  const offQueries = qc.getQueryCache().subscribe((event) => {
    const name = keyName(event.query.queryKey);
    if (event.type === 'updated') {
      const action = event.action.type;
      add(`q.${action}.${name}`);
      if (action === 'fetch') add(`fetch.${name}`);
      if (action === 'invalidate') add(`invalidate.${name}`);
      noteCacheEvent();
    } else if (event.type === 'added' || event.type === 'removed') {
      add(`q.${event.type}.${name}`);
      noteCacheEvent();
    } else {
      add(`q.${event.type}`);
    }
  });
  const offMutations = qc.getMutationCache().subscribe((event) => {
    if (event.type !== 'added' && event.type !== 'removed' && event.type !== 'updated') return;
    const name = keyName(event.mutation?.options.mutationKey);
    const detail = event.type === 'updated' ? event.action.type : event.type;
    add(`m.${detail}.${name}`);
    noteCacheEvent();
    if (event.type === 'updated' && (event.action.type === 'success' || event.action.type === 'error')) {
      settledAt = Date.now();
      noteCacheEvent();
    }
  });
  const reporter = setInterval(() => {
    if (!changed) return;
    probeReport(true);
    perfDump(); // 06.1-72: the Decide marks as `PERF <name> median= p95= n=` lines: names and ms only
  }, REPORT_EVERY_MS);
  return () => {
    offQueries();
    offMutations();
    clearInterval(reporter);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
}

/** One dehydrate of the whole client (persistQueryClient runs one per cache event). */
export function probeDehydrate(ms: number, queries: number): void {
  if (!perfEnabled()) return;
  add('persist.dehydrate', ms);
  add('persist.dehydrate.queries', queries);
}

/** One save: the serialise, encrypt and store milliseconds and the stored plaintext bytes. */
export function probeSave(serializeMs: number, encryptMs: number, storeMs: number, bytes: number): void {
  if (!perfEnabled()) return;
  add('persist.serialize', serializeMs);
  add('persist.encrypt', encryptMs);
  add('persist.store', storeMs);
  add('persist.bytes', bytes);
}

/** React Profiler onRender: one commit for `id` and its actual render ms. */
export function probeCommit(id: string, _phase?: string, actualMs = 0): void {
  if (!perfEnabled()) return;
  add(`commit.${id}`, actualMs);
}

/**
 * Logs counters as `PERF probe <name> n=<count> ms=<total>` (running totals, sorted by name) and returns them; `{}` when
 * off. `changedOnly` logs only the names that moved since the last report (the running probe's 10 s tick).
 */
export function probeReport(changedOnly = false): Record<string, Stat> {
  if (!perfEnabled()) return {};
  const out: Record<string, Stat> = {};
  for (const name of [...stats.keys()].sort()) {
    const s = stats.get(name)!;
    out[name] = { n: s.n, ms: Math.round(s.ms) };
    if (!changedOnly || dirty.has(name)) console.log(`PERF probe ${name} n=${s.n} ms=${Math.round(s.ms)}`);
  }
  changed = false;
  dirty.clear();
  return out;
}

/** Clears every counter (a test seam, and a fresh run on device). */
export function probeReset(): void {
  stats.clear();
  dirty.clear();
  changed = false;
  settledAt = null;
  lastEventAt = 0;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}
