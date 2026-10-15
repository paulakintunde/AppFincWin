// HOME-01/02/03, 03 UI-SPEC Decided #2: the one selected month Home and Activity share, plus a
// one-shot intent that opens Activity on a filter (Pay bills, See all). A module store because
// the Activity tab stays mounted, so a route param cannot re-seed its state.
// L4: a pick made during one month is dropped once today's month moves on.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ActivityFilter } from '@/engine/activity';
import { registerWipeHandler } from '@/services/storage/wipe';

let selectedMonth: string | null = null;
// The fallback month in force when the selection was made, and the last fallback seen.
let anchor: string | null = null;
let lastFallback: string | null = null;
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
  anchor = lastFallback;
  notify();
}

/** The shared month, or `fallback` while nothing has been chosen. */
export function useSelectedMonth(fallback: string): readonly [string, (month: string) => void] {
  const stored = useSyncExternalStore(subscribe, () => selectedMonth);
  const set = useCallback((month: string) => setSelectedMonth(month), []);
  useEffect(() => {
    if (lastFallback === fallback) return;
    lastFallback = fallback;
    if (selectedMonth !== null && anchor !== null && anchor !== fallback) {
      selectedMonth = null;
      anchor = null;
      notify();
    }
  }, [fallback]);
  return [stored ?? fallback, set] as const;
}

/** Pay bills / See all: switch the shared month and ask Activity to apply a filter once. */
export function requestActivityFocus(request: { month: string; filter: ActivityFilter }): void {
  selectedMonth = request.month;
  anchor = lastFallback;
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
  anchor = null;
  lastFallback = null;
  intent = null;
  notify();
}

registerWipeHandler({
  id: 'activity-focus',
  wipe: async () => {
    selectedMonth = null;
    anchor = null;
    lastFallback = null;
    intent = null;
    notify();
  },
});
