/**
 * 06.2 D-20: the Error haptic, only when a save really failed. A write lands in the failed-writes list
 * (src/data/sync/failedWrites.ts) only after its retries are spent or the server refused it; a saved-offline (paused)
 * write never does, so it never fires this.
 *
 * Rules:
 * - one hapticFailed() per growth of the list, however many entries land together;
 * - the boot read of the stored list (hydration) never fires, even when it finishes after mount: only entries
 *   recorded since the first mount count (an entry's `at` is stamped when it is recorded, before any wait);
 * - the list shrinking (retry succeeded, dismissed, sign-out wipe) never fires.
 *
 * The toast host can be mounted twice (the app layer and the top sheet's layer), so the subscription is shared at
 * module level and reference-counted: a failed save gives one haptic, not one per mounted host.
 */
import { useEffect } from 'react';
import { getFailedWrites, subscribeFailedWrites, type FailedWrite } from '@/data/sync/failedWrites';
import { hapticFailed } from './haptics';

let users = 0;
let unsubscribe: (() => void) | null = null;
let seen = new Set<string>();
let since = 0;

function idsOf(list: readonly FailedWrite[]): Set<string> {
  return new Set(list.map((entry) => entry.id));
}

function onChange(): void {
  const list = getFailedWrites();
  const fresh = list.filter((entry) => !seen.has(entry.id));
  seen = idsOf(list);
  if (fresh.some((entry) => Date.parse(entry.at) >= since)) hapticFailed();
}

function start(): void {
  seen = idsOf(getFailedWrites());
  since = Date.now();
  unsubscribe = subscribeFailedWrites(onChange);
}

function stop(): void {
  unsubscribe?.();
  unsubscribe = null;
  seen = new Set();
}

export function useFailedSaveHaptic(): void {
  useEffect(() => {
    users += 1;
    if (users === 1) start();
    return () => {
      users -= 1;
      if (users === 0) stop();
    };
  }, []);
}
