// Phase 10 (10-13, SYN-05, D-27, D-28): the offline write queue is bounded at the entry points. The cap is applied where a
// person starts a new entry, never inside a mutationFn (a replayed write after a restart must always be allowed to run).
export const QUEUE_NOTE_AT = 400;
export const QUEUE_BLOCK_AT = 500;

export type QueueCapState = 'ok' | 'note' | 'blocked';

/** Below 400 waiting changes nothing shows; 400 to 499 a calm note; 500 or more new entries are held back. */
export function queueCap(queued: number): QueueCapState {
  if (queued >= QUEUE_BLOCK_AT) return 'blocked';
  if (queued >= QUEUE_NOTE_AT) return 'note';
  return 'ok';
}

/** True when `adding` more changes still fit within the 500 cap. */
export function canAdd(queued: number, adding: number): boolean {
  return queued + adding <= QUEUE_BLOCK_AT;
}
