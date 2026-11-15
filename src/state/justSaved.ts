// 06.2 L02 save moment: which rows were saved in this session a moment ago, so Activity can give each one a single
// short wash when it first appears. A module store (like activityFocus) because the sheet that saves and the list
// that shows the row are far apart. Marks are ids with the time they were made; a mark older than 10 s is ignored,
// so a row the user scrolls to much later, or a list loaded fresh, never washes (the list never animates on load).
import { registerWipeHandler } from '@/services/storage/wipe';

/** How long a mark stays good: the row has to appear within this window to wash. */
export const JUST_SAVED_WINDOW_MS = 10_000;

const marks = new Map<string, number>();

function fresh(id: string, now: number): boolean {
  const at = marks.get(id);
  if (at === undefined) return false;
  if (now - at > JUST_SAVED_WINDOW_MS) {
    marks.delete(id);
    return false;
  }
  return true;
}

/** Records the new row ids of a save that just succeeded. */
export function markJustSaved(ids: readonly string[], now: number = Date.now()): void {
  for (const id of ids) marks.set(id, now);
}

/** True when `id` has a fresh mark, without using it up (for a render that may run twice). */
export function peekJustSaved(id: string, now: number = Date.now()): boolean {
  return fresh(id, now);
}

/** True once per marked id, and only within the window; the mark is used up either way. */
export function takeJustSaved(id: string, now: number = Date.now()): boolean {
  const ok = fresh(id, now);
  marks.delete(id);
  return ok;
}

export function resetJustSavedForTests(): void {
  marks.clear();
}

registerWipeHandler({
  id: 'just-saved',
  wipe: async () => {
    marks.clear();
  },
});
