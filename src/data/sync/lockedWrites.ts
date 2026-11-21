import { useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';
import { MutationObserver, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { LargeSecureStore } from '@/services/supabase/largeSecureStore';
import { registerWipeHandler } from '@/services/storage/wipe';
import { WRITE_SCOPE } from '../keys';
import { getPlanWriteState } from './planWriteGuard';
import { bumpSessionEpoch } from './sessionEpoch';
import { classifyWriteError } from './writeErrors';

/**
 * 09 D-40: writes the server refused because the plan does not cover the household. Kept
 * encrypted on the phone in order; replayed through the same setMutationDefaults functions when
 * plan_state is writable again (wired by 09-16). Included in the CSV export (09-17). Resolves
 * RESEARCH A8: mutationKey + variables, not the scrubbed attempted row.
 */
export interface LockedWrite {
  id: string;
  mutationKey: readonly unknown[];
  variables: unknown;
  replayable: boolean;
  at: string;
}

export const LOCKED_WRITES_KEY = 'fincwin:locked-writes';

// Same discipline as failedWrites.ts: encrypted at rest (LargeSecureStore), writers wait for
// hydration, persists run serially, a sign-out wipe bumps the generation.
let entries: LockedWrite[] = [];
const listeners = new Set<() => void>();
const store = new LargeSecureStore();
let hydrating: Promise<void> = Promise.resolve();
let persistChain: Promise<void> = Promise.resolve();
let generation = 0;
// The entry being replayed right now (identity compared, see recordLockedWrite).
let replaying: LockedWrite | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(): Promise<void> {
  const next = persistChain.then(() => store.setItem(LOCKED_WRITES_KEY, JSON.stringify(entries)));
  persistChain = next.catch(() => undefined);
  return next;
}

async function readStored(): Promise<LockedWrite[]> {
  try {
    const raw = await store.getItem(LOCKED_WRITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LockedWrite[]) : [];
  } catch {
    return [];
  }
}

/** Reads the persisted list into memory on boot. Never throws; merges with anything already in memory. */
export function hydrateLockedWrites(): Promise<void> {
  const startedAt = generation;
  const run = hydrating.then(async () => {
    const stored = await readStored();
    if (startedAt !== generation) return;
    const storedIds = new Set(stored.map((e) => e.id));
    const memoryOnly = entries.filter((e) => !storedIds.has(e.id));
    entries = [...stored, ...memoryOnly];
    notify();
    if (memoryOnly.length > 0) await persist();
  });
  hydrating = run.catch(() => undefined);
  return run;
}

export async function recordLockedWrite(e: {
  mutationKey: readonly unknown[] | undefined;
  variables: unknown;
}): Promise<void> {
  const mutationKey = e.mutationKey ?? [];
  // 09-25 (A2-W): D-40 keeps writes for a lapsed plan, not for the look-around before a trial. A refusal that arrives
  // while the plan view says sample targets sample rows (or nothing of the person's own) and is dropped, never kept.
  const plan = getPlanWriteState();
  if (plan !== null && !plan.loading && plan.status === 'sample') return;
  // A replayed write that is refused again fires the global onError; it is already held, so do not hold it twice.
  if (replaying && replaying.variables === e.variables && replaying.mutationKey === mutationKey) return;
  const full: LockedWrite = {
    id: Crypto.randomUUID(),
    mutationKey,
    variables: e.variables,
    replayable: mutationKey.length > 0,
    at: new Date().toISOString(),
  };
  await hydrating;
  entries = [...entries, full];
  notify();
  await persist();
}

async function removeEntry(id: string): Promise<void> {
  await hydrating;
  entries = entries.filter((e) => e.id !== id);
  notify();
  await persist();
}

/**
 * 09-25 (A2-W): drops every kept write. Called while the plan view is sample (before any plan): a household with no plan
 * record has never had writes covered, so anything held was refused during the look-around (or before this guard
 * existed) and must not replay into the person's records when the trial starts.
 */
export async function dropLockedWrites(): Promise<number> {
  await hydrating;
  const dropped = entries.length;
  if (dropped === 0) return 0;
  entries = [];
  notify();
  await persist();
  return dropped;
}

/** Same array reference until it changes (useSyncExternalStore). */
export function getLockedWrites(): readonly LockedWrite[] {
  return entries;
}

export function subscribeLockedWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replays kept writes in order through the registered mutation defaults. Success removes the
 * entry. A second PT402 stops the replay and keeps that entry and every later one. Any other
 * error removes the entry here (the mutation's own onError records it as a failed write).
 * Entries that are not replayable are kept and skipped.
 */
export async function replayLockedWrites(qc: QueryClient): Promise<{ synced: number; stillLocked: number }> {
  await hydrating;
  let synced = 0;
  const snapshot = [...entries];
  for (let i = 0; i < snapshot.length; i += 1) {
    const entry = snapshot[i]!;
    if (!entry.replayable) continue;
    replaying = entry;
    try {
      await new MutationObserver<unknown, Error, unknown>(qc, {
        mutationKey: entry.mutationKey as QueryKey,
        scope: WRITE_SCOPE,
      }).mutate(entry.variables);
      synced += 1;
      await removeEntry(entry.id);
    } catch (err) {
      if (classifyWriteError(err) === 'locked') {
        return { synced, stillLocked: entries.length };
      }
      await removeEntry(entry.id);
    } finally {
      replaying = null;
    }
  }
  return { synced, stillLocked: entries.length };
}

export function useLockedWrites(): readonly LockedWrite[] {
  return useSyncExternalStore(subscribeLockedWrites, getLockedWrites, getLockedWrites);
}

registerWipeHandler({
  id: 'locked-writes',
  pendingWriteCount: async () => {
    await hydrating;
    return entries.length;
  },
  wipe: async () => {
    bumpSessionEpoch();
    generation += 1;
    entries = [];
    notify();
    await persistChain;
    await store.removeItem(LOCKED_WRITES_KEY);
  },
});
