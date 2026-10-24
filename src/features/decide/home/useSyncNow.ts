// 05-117: a clock for the notice row's 5 s sync rule. The same two timers SyncStatusLine uses: one fires when a
// pending write crosses 5 s, and a 30 s interval keeps the rest honest. Timers only; state is set from their callbacks.
import { useEffect, useState } from 'react';
import type { SyncStatus } from '@/data/sync/useSyncStatus';
import { nextSyncLineChangeAt } from '@/ui/syncStatusLabel';

const TICK_MS = 30_000;

export function useSyncNow(status: SyncStatus): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const dueAt = nextSyncLineChangeAt(status, now);
  useEffect(() => {
    if (dueAt === null) return;
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, dueAt - Date.now()));
    return () => clearTimeout(id);
  }, [dueAt]);
  return now;
}
