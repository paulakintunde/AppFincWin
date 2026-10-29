// 05.2 D-24: one app-wide host for the "Stopped or paused" sheet, like entryHost. Types only on the
// db side, so features/decide and features/income may open it without reaching the write path.
import { useSyncExternalStore } from 'react';
import { registerWipeHandler } from '@/services/storage/wipe';
import type { RecurringSeriesRow } from '@/db/rows';

let request: RecurringSeriesRow | null = null;
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

export function openSeriesStatus(series: RecurringSeriesRow): void {
  request = series;
  notify();
}

export function closeSeriesStatus(): void {
  if (request === null) return;
  request = null;
  notify();
}

export function useSeriesStatusRequest(): RecurringSeriesRow | null {
  return useSyncExternalStore(subscribe, () => request);
}

export function resetSeriesStatusHostForTests(): void {
  request = null;
  notify();
}

registerWipeHandler({
  id: 'series-status-host',
  wipe: async () => {
    request = null;
    notify();
  },
});
