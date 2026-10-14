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
  notify();
}

registerWipeHandler({
  id: 'sheet-stack',
  wipe: async () => {
    stack = [];
    notify();
  },
});
