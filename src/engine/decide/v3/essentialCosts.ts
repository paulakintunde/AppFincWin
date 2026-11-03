/**
 * Essential costs (05.4 ARC-07; FIN-01 starter). Built inside Decide for now; 05.5 moves it to the safety net's owner.
 * essential costs = your share of the usual bills + debt minimums + typical essential spending, rounded up to a whole currency
 * unit (ESSENTIAL_ROUND_MINOR), returned with its parts. Typical essential spending is the median, over the months the typical
 * month uses, of everyday spending in the categories marked essential; with no category marked it is the typical everyday
 * spending. It never exceeds the typical everyday figure. Pure; integer minor units through bigint.
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { ceilDivide, minorFromBigInt } from '../../payoff/types';
import { ESSENTIAL_ROUND_MINOR } from './constants';
import { everydayByMonth, medianHalfUp } from './month/typical';
import type { MonthModel, V3Debt, V3Inputs } from './types';

export interface EssentialCosts {
  readonly total: MinorUnits;
  readonly parts: { readonly bills: MinorUnits; readonly debtMinimums: MinorUnits; readonly essentialSpending: MinorUnits };
}

const FN = 'essentialCosts';

/**
 * The parts and their rounded-up total. month.recurringBills is already the user's share (bills someone else always pays are
 * left out of the typical month, D-31). A debt minimum below 0 counts as 0.
 */
export function essentialCosts(month: MonthModel, debts: readonly V3Debt[], essentialSpending: MinorUnits): EssentialCosts {
  const bills = BigInt(month.recurringBills > 0 ? month.recurringBills : 0);
  const mins = debts.reduce((t, d) => t + BigInt(d.minimum > 0 ? d.minimum : 0), 0n);
  const spend = BigInt(essentialSpending > 0 ? essentialSpending : 0);
  const unit = BigInt(ESSENTIAL_ROUND_MINOR);
  const total = ceilDivide(bills + mins + spend, unit) * unit;
  return {
    total: minorFromBigInt(total, FN),
    parts: { bills: minorFromBigInt(bills, FN), debtMinimums: minorFromBigInt(mins, FN), essentialSpending: minorFromBigInt(spend, FN) },
  };
}

/**
 * Typical essential spending: the marked categories' median over the typical month's own months, capped at the typical figure.
 * From quick estimates alone the typical figure is all spending, bills included (D-32), so the bills are taken out of it once.
 */
export function essentialSpendingOf(inputs: V3Inputs, month: MonthModel): MinorUnits {
  const typed = month.e !== null && month.monthsUsed.length === 0 && month.reasons.includes('quick_estimates_used');
  const raw = month.e === null ? 0 : typed ? month.e - month.recurringBills : month.e;
  const e = raw > 0 ? raw : 0;
  const ids = inputs.essentialCategoryIds ?? [];
  if (ids.length === 0) return minorUnits(e);
  const used = new Set(month.monthsUsed);
  const months = everydayByMonth(
    inputs.months.filter((m) => used.has(m.month)),
    inputs.series
  );
  if (months.length === 0) return minorUnits(e);
  const per = months.map((m) => ids.reduce((t, id) => t + (m.byCategory.get(id) ?? 0n), 0n));
  const med = medianHalfUp(per);
  return minorFromBigInt(med < BigInt(e) ? med : BigInt(e), FN);
}
