// Review follow-up item 12 (C-IN-02). One import is one finalize and one undo step, and both are
// capped at MAX_UNDO_OPS (6000) ops. The undo step holds a delete per inserted row plus a
// reversal per stored row the suggestions touch (and one more for an accepted limit); the
// finalize holds two patches per transfer link, one per mark-paid, and the limit.
//
// A single rule keeps every mix of suggestions safe: the accepted suggestions never exceed
//   min(2999, MAX_UNDO_OPS - includedLines - 1)
// because the finalize then holds at most 2 * 2999 + 1 ops, and the undo step at most
// includedLines + accepted + 1 (an orphan's counter-leg is one more inserted row; a link or
// mark-paid is one more reversal). Refunds (D-07) add no ops: they are set on the inserted row,
// so they are not counted. Pre-ticked Automatic pay matches (D-08) are counted when the caller
// passes them as accepted. The screen disables further acceptances at the cap and
// says so; declining is always allowed.
import { MAX_UNDO_OPS } from '@/engine/undo/types';

/** A link patches two rows, so the finalize's own ceiling is half the op limit, less the limit patch. */
const FINALIZE_SUGGESTION_CEILING = Math.floor((MAX_UNDO_OPS - 1) / 2);

export function maxAcceptedSuggestions(includedLines: number): number {
  return Math.max(0, Math.min(FINALIZE_SUGGESTION_CEILING, MAX_UNDO_OPS - includedLines - 1));
}

export function acceptedSuggestionCount(
  transferRows: readonly { answer: 'linked' | 'orphan' | 'dismissed' | null }[],
  payMatchRows: readonly { answer: 'accepted' | 'dismissed' | null }[]
): number {
  return (
    transferRows.filter((r) => r.answer === 'linked' || r.answer === 'orphan').length +
    payMatchRows.filter((r) => r.answer === 'accepted').length
  );
}

/** True when one more suggestion can be accepted without crossing the cap. */
export function canAcceptSuggestion(includedLines: number, accepted: number): boolean {
  return accepted < maxAcceptedSuggestions(includedLines);
}
