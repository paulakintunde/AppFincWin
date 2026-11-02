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
 * The engine result in the shape of a case's expected block. afterBuy.usualMonth stays null until FIN-09 adds it.
 * reasons: the result's reason codes and, since 05.4-16 (FIN-25 / ENG-10), the confidence reasons that replace the level
 * (few_months, quick_estimates, ...), which the approved cases name as reasons.
 */
export function pick(e: Evaluation): Picked {
  const r = e.result;
  const left = r.facts.find((f) => f.code === 'month_left_after');
  const v = left ? left.values['left'] : null;
  return {
    code: r.code,
    variant: r.variant,
    afterBuy: { month: typeof v === 'number' ? v : null, usualMonth: null },
    readyBy: r.readyBy === null ? null : r.readyBy.kind === 'date' ? r.readyBy.date : r.readyBy.month,
    reasons: [...r.reasons, ...r.confidence.reasons.map((x) => x.code)],
    facts: r.facts.map((f) => f.code),
  };
}
