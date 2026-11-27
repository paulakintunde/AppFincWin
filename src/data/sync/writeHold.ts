// 10-review (L-7): a hold on the write queue while the lock screen's "sign in again" runs. Until the app knows whether
// the person who signed in is the lock's owner, nothing queued may be sent under the new session: the queue is held
// offline (TanStack Query pauses writes while offline) and the online bridge (onlineManager.ts) does not lift it.
// Released when the answer is known: the same person keeps the queue; a different person's sign-out wipe clears it
// first.
import { onlineManager } from '@tanstack/react-query';

let held = false;
const releaseListeners = new Set<() => void>();

export function isWriteHeld(): boolean {
  return held;
}

/** Pauses the queue now. Writes already on the wire finish; nothing new starts until releaseWrites(). */
export function holdWrites(): void {
  held = true;
  onlineManager.setOnline(false);
}

/** Lifts the hold and asks the online bridge to re-check the connection (which resumes the queue when online). */
export function releaseWrites(): void {
  if (!held) return;
  held = false;
  // No bridge running (tests, or before boot): back to TanStack Query's own default of online.
  if (releaseListeners.size === 0) onlineManager.setOnline(true);
  for (const l of releaseListeners) l();
}

/** The online bridge listens here so a release re-checks the connection. */
export function onWritesReleased(listener: () => void): () => void {
  releaseListeners.add(listener);
  return () => releaseListeners.delete(listener);
}
