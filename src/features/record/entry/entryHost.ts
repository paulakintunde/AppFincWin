// D-09/D-11/HOME-01: one app-wide host for the new-transaction sheet so Home's Add, the FAB and
// its quick menu open the same TransactionSheet, rendered once by the shell (ShellEntryHost,
// 03-15). Activity keeps its own sheet for row edits.
import { useSyncExternalStore } from 'react';
import { registerWipeHandler } from '@/services/storage/wipe';
import type { EntryMode } from './entryMode';

let mode: EntryMode | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openEntry(next: EntryMode): void {
  mode = next;
  notify();
}

export function closeEntry(): void {
  if (mode === null) return;
  mode = null;
  notify();
}

export function useEntryHostMode(): EntryMode | null {
  return useSyncExternalStore(subscribe, () => mode);
}

export function resetEntryHostForTests(): void {
  mode = null;
  notify();
}

registerWipeHandler({
  id: 'entry-host',
  wipe: async () => {
    mode = null;
    notify();
  },
});
