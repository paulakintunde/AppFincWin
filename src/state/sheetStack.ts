// D-10/D-16/D-28/D-29: the ids of open sheets in open order (= visual order). Each Sheet is its own
// native window, so a module store (like undoToast.ts) is readable from all of them. Sheet (03-09)
// pushes on show and removes on hide/unmount; the FAB hides while any is open; only the top sheet
// hosts the toast (03-19).
import { useSyncExternalStore } from 'react';
import { registerWipeHandler } from '@/services/storage/wipe';

let stack: readonly string[] = [];
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

export function pushSheet(id: string): void {
  if (stack.includes(id)) return;
  stack = [...stack, id];
  notify();
}

export function removeSheet(id: string): void {
  if (!stack.includes(id)) return;
  stack = stack.filter((s) => s !== id);
  notify();
}

// D-85 / R16.1: a leaked id (a Sheet whose close animation never finished) must never hide the FAB
// for good. Each Sheet marks itself mounted; the watchdog drops ids with no mounted sheet and
// clears a stack that stays non-empty with nothing visible for over STALE_MS.
export const STALE_MS = 1000;

const mounted = new Set<string>();
let staleSince: number | null = null;

export function markMounted(id: string): void {
  mounted.add(id);
}

export function markUnmounted(id: string): void {
  mounted.delete(id);
}

export function mountedSheetCount(): number {
  return mounted.size;
}

/** Drops ids whose sheet is not mounted. Returns how many were dropped. */
export function prune(_now: number): number {
  const kept = stack.filter((id) => mounted.has(id));
  const dropped = stack.length - kept.length;
  if (dropped > 0) {
    stack = kept;
    notify();
  }
  return dropped;
}

/**
 * Clears the stack when ids remain but nothing has been visible for over STALE_MS. Returns the
 * count cleared (0 when nothing was cleared), for a counts-only breadcrumb.
 */
export function noteVisible(now: number, anyVisible: boolean): number {
  if (anyVisible || stack.length === 0) {
    staleSince = null;
    return 0;
  }
  if (staleSince === null) {
    staleSince = now;
    return 0;
  }
  if (now - staleSince <= STALE_MS) return 0;
  const cleared = stack.length;
  stack = [];
  staleSince = null;
  notify();
  return cleared;
}

export function getSheetStack(): readonly string[] {
  return stack;
}

export function useSheetCount(): number {
  return useSyncExternalStore(subscribe, () => stack.length);
}

export function useTopSheetId(): string | null {
  return useSyncExternalStore(subscribe, () => stack[stack.length - 1] ?? null);
}

export function useIsTopSheet(id: string): boolean {
  return useSyncExternalStore(subscribe, () => stack[stack.length - 1] === id);
}

/** Test helper: empties the stack. */
export function resetSheetStackForTests(): void {
  stack = [];
  mounted.clear();
  staleSince = null;
  notify();
}

registerWipeHandler({
  id: 'sheet-stack',
  wipe: async () => {
    stack = [];
    notify();
  },
});
