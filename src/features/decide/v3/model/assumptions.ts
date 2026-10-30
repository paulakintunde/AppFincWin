/** 05.3-19: the "assumptions in play" line under the answer. Pure. */
import type { Evaluation } from '@/engine/decide/v3';

export function assumptions(ev: Pick<Evaluation, 'month' | 'result'>): { key: string; params: Readonly<Record<string, string | number>> } {
  const { month, result } = ev;
  const date = `${month.month}-${String(month.daysInMonth).padStart(2, '0')}`;
  const typed = result.confidence.reasons.includes('rough_figures');
  return {
    key: typed ? 'decide.v3.ui.answer.assumptionsTyped' : 'decide.v3.ui.answer.assumptions',
    params: { amount: month.erest, date },
  };
}
