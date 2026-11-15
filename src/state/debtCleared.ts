// 06.2-21 (D-19, D-20): the one debt milestone. When a recorded payment carries a debt's balance to zero, the payment
// flow marks the debt here; the debt detail takes the mark once and plays the debt-cleared icon with one Success tap.
// A module store (like justSaved) because the write and the screen are far apart. A mark is one-shot per id and is
// ignored after 60 s, so a later visit, a cold start or a list loaded fresh never replays the moment.
import { registerWipeHandler } from '@/services/storage/wipe';

/** How long a mark stays good: the debt detail has to see it within this window. */
export const DEBT_CLEARED_WINDOW_MS = 60_000;

const marks = new Map<string, number>();
const listeners = new Set<() => void>();

/** Records that a payment just cleared debt `id` (its balance after the payment is zero or less). */
export function markDebtCleared(id: string, now: number = Date.now()): void {
  marks.set(id, now);
  for (const l of [...listeners]) l();
}

/** True once per marked id, and only within the window; the mark is used up either way. */
export function takeDebtCleared(id: string, now: number = Date.now()): boolean {
  const at = marks.get(id);
  if (at === undefined) return false;
  marks.delete(id);
  return now - at <= DEBT_CLEARED_WINDOW_MS;
}

/** Calls `listener` after each mark, so an open debt detail can take a mark made after it mounted. */
export function subscribeDebtCleared(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetDebtClearedForTests(): void {
  marks.clear();
  listeners.clear();
}

registerWipeHandler({
  id: 'debt-cleared',
  wipe: async () => {
    marks.clear();
  },
});
