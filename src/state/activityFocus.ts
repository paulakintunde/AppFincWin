// HOME-01/02/03, 03 UI-SPEC Decided #2: the one selected month Home and Activity share, plus a
// one-shot intent that opens Activity on a filter (Pay bills, See all). A module store because
// the Activity tab stays mounted, so a route param cannot re-seed its state.
import { useCallback, useSyncExternalStore } from 'react';
import type { ActivityFilter } from '@/engine/activity';
import { registerWipeHandler } from '@/services/storage/wipe';

let selectedMonth: string | null = null;
let intent: ActivityFilter | null = null;
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

export function getSelectedMonth(): string | null {
  return selectedMonth;
}

export function setSelectedMonth(month: string): void {
  if (selectedMonth === month) return;
  selectedMonth = month;
  notify();
}

/** The shared month, or `fallback` while nothing has been chosen. */
export function useSelectedMonth(fallback: string): readonly [string, (month: string) => void] {
  const stored = useSyncExternalStore(subscribe, () => selectedMonth);
  const set = useCallback((month: string) => setSelectedMonth(month), []);
  return [stored ?? fallback, set] as const;
}

/** Pay bills / See all: switch the shared month and ask Activity to apply a filter once. */
export function requestActivityFocus(request: { month: string; filter: ActivityFilter }): void {
  selectedMonth = request.month;
  intent = request.filter;
  notify();
}

export function useActivityFilterIntent(): ActivityFilter | null {
  return useSyncExternalStore(subscribe, () => intent);
}

/** Returns the pending intent once, then null. */
export function consumeActivityFilterIntent(): ActivityFilter | null {
  const taken = intent;
  if (taken === null) return null;
  intent = null;
  notify();
  return taken;
}

export function resetActivityFocusForTests(): void {
  selectedMonth = null;
  intent = null;
  notify();
}

registerWipeHandler({
  id: 'activity-focus',
  wipe: async () => {
    selectedMonth = null;
    intent = null;
    notify();
  },
});
