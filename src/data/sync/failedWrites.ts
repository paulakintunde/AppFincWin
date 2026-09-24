import * as Crypto from 'expo-crypto';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import { registerWipeHandler } from '@/services/storage/wipe';
import type { WriteEntity } from '@/db/errors';

/**
 * D-19: every permanently failed or conflicting write is kept here with its reason and the
 * change that was attempted, until the user dismisses it or the device is wiped. A user
 * must never silently lose an entry.
 */
export interface FailedWrite {
  id: string;
  entity: WriteEntity;
  entityId: string;
  kind: 'conflict' | 'rejected' | 'not-found';
  code: string;
  attempted: Record<string, unknown>;
  at: string;
}

export const FAILED_WRITES_KEY = 'fincwin:failed-writes';

type FailureReporter = (failure: { entity: WriteEntity; kind: FailedWrite['kind']; code: string }) => void;

// T-01-09-01: encrypted at rest via LargeSecureStore (AES, key in SecureStore) since the
// attempted payload can contain amounts and notes. No cap on entry count -- bounded growth
// is SYN-05, deferred to Phase 10 along with the rest of the queue-hardening work.
let entries: FailedWrite[] = [];
const listeners = new Set<() => void>();
let reporter: FailureReporter | null = null;
const store = new LargeSecureStore();

function notify(): void {
  for (const listener of listeners) listener();
}

async function persist(): Promise<void> {
  await store.setItem(FAILED_WRITES_KEY, JSON.stringify(entries));
}

/**
 * Reads the persisted failed-writes list into memory (e.g. on app boot). A corrupt or
 * missing stored value falls back to an empty list rather than throwing -- this must never
 * crash app boot (mirrors src/theme/themeCache.ts's corrupt-data handling).
 */
export async function hydrateFailedWrites(): Promise<void> {
  try {
    const raw = await store.getItem(FAILED_WRITES_KEY);
    if (!raw) {
      entries = [];
    } else {
      const parsed: unknown = JSON.parse(raw);
      entries = Array.isArray(parsed) ? (parsed as FailedWrite[]) : [];
    }
  } catch {
    entries = [];
  }
  notify();
}

/**
 * Records a permanently failed or conflicting write. T-01-09-02: the failure reporter
 * receives only entity, kind and code -- never the attempted payload -- so a scrubbed
 * event can reach error tracking (Phase 0 D-18) without this module importing it.
 */
export async function recordFailedWrite(entry: Omit<FailedWrite, 'id' | 'at'>): Promise<void> {
  const full: FailedWrite = {
    ...entry,
    id: Crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  entries = [...entries, full];
  notify();
  await persist();

  if (reporter) {
    try {
      reporter({ entity: entry.entity, kind: entry.kind, code: entry.code });
    } catch {
      // A throwing reporter must never break recording.
    }
  }
}

export async function dismissFailedWrite(id: string): Promise<void> {
  entries = entries.filter((entry) => entry.id !== id);
  notify();
  await persist();
}

/** Returns the same array reference until it changes -- required by useSyncExternalStore. */
export function getFailedWrites(): readonly FailedWrite[] {
  return entries;
}

export function subscribeFailedWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Lets the app send a scrubbed failure event to error tracking without this module
 * importing it (Phase 0 D-18 scrubbing). Pass null to remove a previously-set reporter.
 */
export function setFailureReporter(fn: FailureReporter | null): void {
  reporter = fn;
}

// Registered at module scope, not inside a component, so sign-out always wipes this list
// regardless of which screens have mounted (T-01-09-01).
registerWipeHandler({
  id: 'failed-writes',
  wipe: async () => {
    entries = [];
    notify();
    await store.removeItem(FAILED_WRITES_KEY);
  },
});
