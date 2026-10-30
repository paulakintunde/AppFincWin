/**
 * 05.3-40 (D-05, T-05.3-40-03): which saved regular payment can offer to fill an item-cost question. PURE.
 * Amounts are never filled in on their own: the card shows "You pay {amount} a month for {name} now. Use it?" and fills
 * only when the user presses "Use it". Only an exact category pair AND an exact frequency match is offered, so no
 * figure is converted or rounded here: a monthly question reads a monthly series, a yearly one a yearly series.
 * Left out on purpose: fuel_monthly (the builtin Transport category is not fuel) and utilities_change (a change is not
 * the bill itself, so the bill's amount would be the wrong number).
 */
import type { MinorUnits } from '@/engine/money';
import type { QuestionId } from '@/engine/decide/v3';

export interface PrefillSeries {
  readonly id: string;
  readonly name: string;
  /** The series amount per its own frequency, in minor units. */
  readonly amount: MinorUnits;
  /** The builtin category key of the series, or null for a custom or missing category. */
  readonly categoryKey: string | null;
  readonly freq: string;
}

export interface Prefill {
  readonly amount: MinorUnits;
  readonly name: string;
}

const PAIRS: Readonly<Record<string, { readonly category: string; readonly freq: string }>> = {
  insurance_monthly: { category: 'Insurance', freq: 'monthly' },
  home_insurance: { category: 'Insurance', freq: 'yearly' },
};

export function costPrefill(id: QuestionId, series: readonly PrefillSeries[]): Prefill | null {
  const pair = PAIRS[id];
  if (pair === undefined) return null;
  const hit = series.find((s) => s.categoryKey === pair.category && s.freq === pair.freq && s.amount > 0);
  return hit === undefined ? null : { amount: hit.amount, name: hit.name };
}
