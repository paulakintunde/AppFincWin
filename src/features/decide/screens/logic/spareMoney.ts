/**
 * 06.1-85 (G-PD-2): the spare money figure the answer's sheet names, and the unexplained money ask's answer, both read from the
 * engine's own Prepared (the inputs and readings the judge reads), never worked out a second way.
 *
 * The figure is the as-given reading's worked sum (the reading readiness reads). It no longer depends on which reading won for one
 * check, and the anchor is dated on the inputs' own day, so nothing rolls between the figure and the day it is saved.
 * Thin history: the engine also judges an all-full reading whose everyday spending to come can be 0, and it reads its unexplained
 * money against that reading's own figure. Confirming the as-given figure then still raises "What is the $X for?" there. That needs
 * an engine change (reported in 06.1-85-SUMMARY); until then the ask is answerable on the answer (unexplainedAsk).
 */
import { unspentSum, type Prepared, type UnspentSum } from '@/engine/decide/v3';

/** The engine's worked spare money sum on the as-given reading. */
export function spareSumOf(p: Prepared): UnspentSum {
  return unspentSum(p.inputs, (p.readings[0] as Prepared['readings'][number]).month);
}

/** The decide_settings patch that confirms `figure` (minor units): plus the money held back for bridges, dated on the inputs' day. */
export function spareAnchorPatch(p: Prepared, figure: number, heldBack: number): { unspent_anchor: number; unspent_anchor_at: string } {
  return { unspent_anchor: figure + heldBack, unspent_anchor_at: p.inputs.asOf };
}

/**
 * The unexplained money the engine asks about (`shown`, the most any reading asks), and the amount an answer must carry to cover
 * it (`amount`: the earlier answer's amount, which the engine already counted, plus `shown`). Null when no reading asks.
 */
export function unexplainedAsk(p: Prepared): { readonly shown: number; readonly amount: number } | null {
  let shown = 0;
  for (const r of p.readings) shown = Math.max(shown, r.funds.unexplained ?? 0);
  if (shown <= p.inputs.thresholds.unspentDrift) return null;
  const prev = p.inputs.unexplainedAnswer;
  const before = prev != null && Number.isSafeInteger(prev.amount) && prev.amount >= 0 ? prev.amount : 0;
  return { shown, amount: before + shown };
}
