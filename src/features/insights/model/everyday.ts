// 07-09: thin glue between the shared Prepared and the Everyday sections. No money is computed here; every figure is the engine's.
import type { Prepared } from '@/engine/decide/v3';
import { barTotals, barsInRange, categoryTotals, compareMonths, monthsInRange } from '@/engine/insights';
import type { CategoryBreakdown, InsightsRange, MonthComparison } from '@/engine/insights';
import { monthBars, type MonthBar } from '@/engine/month';

export interface InOutModel {
  bars: readonly MonthBar[];
  totals: { comesIn: number; goesOut: number; left: number };
  oneMonth: boolean;
  empty: boolean;
}

/** D-26a: barsInRange already returns N full months plus this month, so nothing is sliced again here. */
export function inOutModel(prepared: Prepared, range: InsightsRange): InOutModel {
  const bars = barsInRange(monthBars(prepared, { throughCurrent: true }), range);
  return { bars, totals: barTotals(bars), oneMonth: bars.length === 1, empty: bars.length === 0 };
}

export type CategoryPeriod = { kind: 'month'; month: string } | { kind: 'range'; range: InsightsRange };

export function categoryModel(prepared: Prepared, period: CategoryPeriod): CategoryBreakdown & { months: readonly string[] } {
  const months = period.kind === 'month' ? [period.month] : monthsInRange(monthBars(prepared, { throughCurrent: true }), period.range);
  return { ...categoryTotals(prepared.inputs.months, months), months };
}

export function compareModel(prepared: Prepared, month: string): MonthComparison {
  return compareMonths(prepared.inputs.months, monthBars(prepared, { throughCurrent: true }), month);
}

/** Months with records, newest first (the month chips). */
export function recordedMonths(prepared: Prepared): readonly string[] {
  return [...monthsInRange(monthBars(prepared, { throughCurrent: true }), 'all')].reverse();
}
