/**
 * Cause classification for the shadow run (05.1-28, D-14). Test-only.
 *
 * Each changed answer gets exactly one cause: the FIRST rule below that matches. The order is part of the contract
 * (a change that has two reasons is filed under the earlier one), so reordering moves entries between groups.
 *
 *  1. needs_input_rules          v3 asks for a figure it needs (code needs_input); the old engine answered anyway
 *  2. unspent_confirmed          v3 answers fits_unspent: the user confirmed unspent money and it covers the price
 *  3. emergency_locked           the old engine fitted it (fits/adjust); v3 does not, and it would only fit with the
 *                                emergency fund counted, which v3 keeps untouchable (D-09)
 *  4. erest_not_zero_spend       the old engine fitted it; the month-left figure would cover the day-one cost if the rest
 *                                of the month's everyday spending were zero, but v3 carries a rest-of-month spend (Erest > 0)
 *  5. quoted_payment_max         a quoted instalment differs from the computed one and v3 judged the larger (D-05)
 *  6. cash_path_spread           v3's cash path (payday or not covered) is the reason, not the month; or the old engine's own cash warning (cash, or cash_dip) that v3's cash path does not raise
 *  7. low_month_clause           the low-month clause (second-lowest month) decided it
 *  8. median_ignores_outlier     v3's typical everyday spend (median) is below the old average, so an outlier month no
 *                                longer sets the figure
 *  9. real_bill_schedule         the person has a bill that is not monthly; v3 places it on its real due dates
 * 10. typical_month_short        v3 carries the typical_short notice (too few full months for a typical month)
 * 11. other                      none of the above; reviewed by hand
 */
import type { Evaluation } from '../../evaluate';
import type { Code } from '../../types';
import type { FixturePerson, FixturePurchase } from '../golden/adapter';

export type Cause =
  | 'erest_not_zero_spend'
  | 'median_ignores_outlier'
  | 'emergency_locked'
  | 'unspent_confirmed'
  | 'real_bill_schedule'
  | 'typical_month_short'
  | 'needs_input_rules'
  | 'cash_path_spread'
  | 'quoted_payment_max'
  | 'low_month_clause'
  | 'other';

export const CAUSES: readonly Cause[] = [
  'needs_input_rules',
  'unspent_confirmed',
  'emergency_locked',
  'erest_not_zero_spend',
  'quoted_payment_max',
  'cash_path_spread',
  'low_month_clause',
  'median_ignores_outlier',
  'real_bill_schedule',
  'typical_month_short',
  'other',
];

export type OldState = 'fits' | 'adjust' | 'no' | 'missing';

export interface ClassifyContext {
  readonly ev: Evaluation;
  readonly code: Code;
  readonly old: OldState;
  readonly person: FixturePerson;
  readonly purchase: FixturePurchase;
  /** Codes of the warnings the old engine raised (e.g. 'cash', 'month'); empty when it raised none. */
  readonly oldWarnings: readonly string[];
}

/** Average of the everyday (spending, no series) lines over the full months: what the old engine called the typical spend. */
export function oldAverageEveryday(person: FixturePerson): number | null {
  const full = person.months.filter((m) => m.full ?? true);
  if (full.length === 0) return null;
  let total = 0;
  for (const m of full) for (const l of m.lines) if (l.role === 'spending' && !l.seriesId) total += l.amount;
  return Math.round(total / full.length);
}

export function classify(c: ClassifyContext): Cause {
  const { ev, code, old } = c;
  const oldFitted = old === 'fits' || old === 'adjust';
  if (code === 'needs_input') return 'needs_input_rules';
  if (code === 'fits_unspent' && old !== 'fits') return 'unspent_confirmed';
  const dayOne = ev.purchase === null ? 0 : Number(ev.purchase.dayOne);
  const monthLeft = Number(ev.month.monthLeft);
  const erest = Number(ev.month.erest);
  const emergency = ev.funds.emergency === null ? 0 : Number(ev.funds.emergency);
  if (oldFitted && (code === 'not_yet' || code === 'emergency_use') && emergency > 0 && monthLeft < dayOne && monthLeft + emergency >= dayOne) {
    return 'emergency_locked';
  }
  if (oldFitted && erest > 0 && monthLeft < dayOne && monthLeft + erest >= dayOne) return 'erest_not_zero_spend';
  if (ev.result.facts.some((f) => f.code === 'quoted_differs')) return 'quoted_payment_max';
  const variant = ev.result.variant;
  if (variant === 'payday' || variant === 'not_covered') return 'cash_path_spread';
  if (c.oldWarnings.some((w) => w === 'cash' || w === 'cash_dip')) return 'cash_path_spread';
  if (variant === 'low_month') return 'low_month_clause';
  const e = ev.month.e === null ? null : Number(ev.month.e);
  const avg = oldAverageEveryday(c.person);
  if (e !== null && avg !== null && e < avg) return 'median_ignores_outlier';
  if (c.person.series.some((s) => s.role === 'bill' && !(s.cadence.unit === 'month' && s.cadence.every === 1))) return 'real_bill_schedule';
  if (ev.result.notices.some((n) => n.code === 'typical_short')) return 'typical_month_short';
  return 'other';
}
