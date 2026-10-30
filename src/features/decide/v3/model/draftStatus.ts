/**
 * 05.3-17: the draft's save status from the save mutation state, and the price check.
 * A pending save that is not paused counts as saved: the screen shows only saved, offline or notSaved.
 */
import type { MinorUnits } from '@/engine/money';

export function draftStatus(m: { status: 'idle' | 'pending' | 'success' | 'error'; isPaused?: boolean }): 'saved' | 'offline' | 'notSaved' {
  if (m.isPaused === true) return 'offline';
  if (m.status === 'error') return 'notSaved';
  return 'saved';
}

export function priceProblem(price: MinorUnits | null): 'priceNeeded' | null {
  return price === null || price === 0 ? 'priceNeeded' : null;
}
