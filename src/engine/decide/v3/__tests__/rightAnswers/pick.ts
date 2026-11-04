import type { Evaluation } from '../../evaluate';
import type { Expected } from './schema';

export interface Picked {
  code: string;
  variant: string | null;
  afterBuy: Expected['afterBuy'];
  readyBy: string | null;
  reasons: string[];
  facts: string[];
}

/**
 * The engine result in the shape of a case's expected block. Since 05.4-24 (FIN-09) afterBuy reads the result's afterBuy block
 * (this month after its plans less what the purchase takes this month, and the usual month once payments start); an ask
 * (needs_input) has no answer, so no figure.
 * reasons: the result's reason codes and, since 05.4-16 (FIN-25 / ENG-10), the confidence reasons that replace the level
 * (few_months, quick_estimates, ...), which the approved cases name as reasons. Since 05.4-25 (FIN-27, TX-09) an ask's missing
 * codes too: the approved cases name the figure an ask waits for as a reason ("plan_rate_missing": no rate typed, so the answer
 * asks for it and never uses an example rate, D-21).
 */
export function pick(e: Evaluation): Picked {
  const r = e.result;
  const ask = r.code === 'needs_input';
  return {
    code: r.code,
    variant: r.variant,
    afterBuy: { month: ask ? null : r.afterBuy.month, usualMonth: ask ? null : r.afterBuy.usualMonth },
    readyBy: r.readyBy === null ? null : r.readyBy.kind === 'date' ? r.readyBy.date : r.readyBy.month,
    reasons: [...r.reasons, ...r.confidence.reasons.map((x) => x.code), ...(ask ? r.missing : [])],
    facts: r.facts.map((f) => f.code),
  };
}
