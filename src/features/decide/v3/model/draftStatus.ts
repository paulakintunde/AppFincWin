/**
 * 05.3-17: the draft's save status from the save mutation state, and the price check.
 * A pending save that is not paused counts as saved: the screen shows only saved, offline or notSaved.
 * 05.3-72 (gap 6): a price above 100 x the top band edge is past the range Decide checks; the figure is refused, the last valid price stays (UI-SPEC).
 * Owner decision (2026-10-31): 100 times the biggest price band, about $500 million in USD.
 */
import type { HomeThresholds } from '@/engine/decide/v3';
import { MAX_ABS_AMOUNT_MINOR } from '@/engine/money/types';
import type { MinorUnits } from '@/engine/money';

export const PRICE_CEILING_EDGE_MULTIPLE = 100;
export const PRICE_CEILING_NO_EDGES = 100_000_000_000;

export function draftStatus(m: { status: 'idle' | 'pending' | 'success' | 'error'; isPaused?: boolean }): 'saved' | 'offline' | 'notSaved' {
  if (m.isPaused === true) return 'offline';
  if (m.status === 'error') return 'notSaved';
  return 'saved';
}

/** The largest price Decide will check, in the home currency's minor units (integer maths). */
export function priceCeiling(t: Pick<HomeThresholds, 'bandEdges'>): number {
  if (t.bandEdges.length === 0) return PRICE_CEILING_NO_EDGES;
  const top = Number(t.bandEdges[t.bandEdges.length - 1]);
  return Math.min(top * PRICE_CEILING_EDGE_MULTIPLE, MAX_ABS_AMOUNT_MINOR);
}

export function priceProblem(price: MinorUnits | null, ceiling: number = MAX_ABS_AMOUNT_MINOR): 'priceNeeded' | 'priceTooBig' | null {
  if (price === null || price === 0) return 'priceNeeded';
  return price > ceiling ? 'priceTooBig' : null;
}
