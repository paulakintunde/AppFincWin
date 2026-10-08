// Second-source (witness) confirmation of holds created in this very call
// (MON-11, D-12). Ported from the retired fx-sync's WR-B03 block: pure, so
// it loads identically under Deno and Jest. Type-only imports, erased at
// compile time.
import type { FxRow } from './parse.ts';
import { CONFIRM_TOLERANCE, type Classification, type OpenHold } from './plausibility.ts';

/**
 * Matches each hold this call created, by its exact (quote, date, source),
 * against the freshly re-read open holds -- never by quote alone: an older
 * hold for the same quote (possibly an open.er-api one from a fallback day,
 * which an open.er-api witness must not "confirm") could otherwise be picked
 * (WR-B03). A hold is confirmed when the witness reading for its quote is
 * within CONFIRM_TOLERANCE of the HELD value; the row to store is the held
 * value itself (not the witness's), grouped by the hold's own source.
 */
export function confirmWithWitness(
  created: Classification['hold'],
  freshHolds: OpenHold[],
  witnessRows: FxRow[]
): { rowsBySource: Map<string, FxRow[]>; holdIds: number[] } {
  const rowsBySource = new Map<string, FxRow[]>();
  const holdIds: number[] = [];

  for (const c of created) {
    const held = freshHolds.find((h) => h.quote === c.quote && h.heldDate === c.date && h.source === c.source);
    const witness = witnessRows.find((w) => w.quote === c.quote);
    if (!held || !witness) continue;
    if (Math.abs(Number(witness.rate) / Number(held.heldRate) - 1) <= CONFIRM_TOLERANCE + 1e-9) {
      const row: FxRow = { base: witness.base, quote: held.quote, rate: held.heldRate, date: held.heldDate };
      rowsBySource.set(held.source, [...(rowsBySource.get(held.source) ?? []), row]);
      holdIds.push(held.id);
    }
  }

  return { rowsBySource, holdIds };
}
