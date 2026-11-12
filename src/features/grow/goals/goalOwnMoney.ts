// P4-WR-01: a goal's figures in the goal's OWN currency. The read model (useGoalsRead) holds home-currency points for Decide; the
// goal screens compare saved with the row's target, monthly amount and line amounts, which are all stored in the goal's currency,
// so they need saved in that same currency. Pure: no React, no I/O.
import { convertLatest } from '@/data/queries/fxConvert';
import type { PastContext } from '@/features/decide/past/usePastDecisions';
import { clampSaved, goalSaved } from '../connect/goalSaved';
import type { GoalLineSource, GoalSourceRow, ToHome } from '../connect/types';

/** Money into `currency` at the latest rate; null when no rate exists (never guessed). */
export function toCurrencyOf(ctx: Pick<PastContext, 'rates' | 'customs' | 'today'>, currency: string): ToHome {
  return (amount, from) => {
    if (amount === 0 || from === currency) return amount;
    return convertLatest(amount, from, currency, ctx.rates, ctx.customs, ctx.today)?.amount ?? null;
  };
}

/**
 * What a goal has saved, in the goal's own currency, clamped like the read model (never below 0). When the goal is in the home
 * currency the read model's figure is used as is (the same number Decide reads); otherwise the goal's lines are summed again in
 * the goal's currency. Null when a line cannot convert.
 */
export function ownSavedOf(
  row: GoalSourceRow,
  homeSaved: number | null,
  lines: readonly GoalLineSource[],
  ctx: Pick<PastContext, 'home' | 'rates' | 'customs' | 'today'>
): number | null {
  if (row.currency === ctx.home && homeSaved !== null) return homeSaved;
  const saved = goalSaved(row, lines, toCurrencyOf(ctx, row.currency));
  return saved === null ? null : clampSaved(saved);
}
