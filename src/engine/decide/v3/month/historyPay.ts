/**
 * 05.4 D-52 (owner, 2026-11-03): expected pay from history. A steady-but-irregular earner (the profile says freelance, or it has
 * a variable method, or its stated pattern is variable or seasonal) with at least HISTORY_PAY_MIN_MONTHS full months of recorded
 * income and no live pay series gets pay in the 90-day cash path on the usual payday at the low-month amount.
 *
 * - The months are the newest V3_VARIABLE_HISTORY_MONTHS (12) full months of recorded income (recordedIncomeByMonth): an
 *   irregular earner reads the 12-month window (D-33), so a lean month earlier in the year still sets the amount.
 * - amount: the smallest of those months' incomes (the lowest month, the cautious reading; not the second lowest).
 * - day: the upper median of the days of every paid, eligible income line in those months.
 * - dates: one per month from asOf's month to the path's last month, on min(day, days in the month), strictly after asOf and
 *   before the path end. This month's date is kept only when no paid, eligible income line is recorded this month yet.
 *   A low month of 0 lands nothing (dates []).
 * Pure: asOf comes from the inputs.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { CASH_PATH_DAYS_V3, HISTORY_PAY_MIN_MONTHS, V3_VARIABLE_HISTORY_MONTHS } from '../constants';
import { addDays, addYearMonths, dayOfMonth, daysInYearMonth, yearMonthOf } from '../dates';
import type { IncomeProfile, LocalDate, V3Inputs } from '../types';
import { recordedIncomeByMonth } from './incomePattern';
import { eligibility, planOf } from './incomeProfile';
import { liveSeriesOf, seriesIndex } from './series';

export interface HistoryPay {
  /** The usual payday (day of month, 1..31). */
  readonly day: number;
  /** The lowest of the months' recorded incomes. */
  readonly amount: MinorUnits;
  /** How many full months were read. */
  readonly months: number;
  /** The dates pay is expected inside the 90-day path, in order; [] when amount is 0. */
  readonly dates: readonly LocalDate[];
}

/** Freelance, a variable method, or a stated variable or seasonal pattern. */
function irregular(p: IncomeProfile): boolean {
  return p.types.includes('freelance') || p.variable !== null || p.pattern === 'variable' || p.pattern === 'seasonal';
}

export function historyPay(inputs: V3Inputs): HistoryPay | null {
  const { asOf, profile } = inputs;
  if (liveSeriesOf(inputs.series, asOf, 'pay').length > 0) return null;
  if (profile === null || !irregular(profile)) return null;
  const current = yearMonthOf(asOf);
  const byMonth = recordedIncomeByMonth({ asOf, history: inputs.months, series: inputs.series, profile, custom: inputs.custom });
  const keys = [...byMonth.keys()].sort().slice(-V3_VARIABLE_HISTORY_MONTHS);
  if (keys.length < HISTORY_PAY_MIN_MONTHS) return null;
  let low = byMonth.get(keys[0] as string) as bigint;
  for (const k of keys) {
    const v = byMonth.get(k) as bigint;
    if (v < low) low = v;
  }
  const idx = seriesIndex(inputs.series);
  const plan = planOf(profile);
  const counts = (l: V3Inputs['months'][number]['lines'][number]): boolean => l.status === 'paid' && eligibility(l, idx, plan, inputs.custom).ok;
  const picked = new Set(keys);
  const days: number[] = [];
  for (const m of inputs.months) {
    if (!picked.has(m.month)) continue;
    for (const l of m.lines) if (counts(l)) days.push(dayOfMonth(l.date));
  }
  days.sort((a, b) => a - b);
  // A month with recorded income holds at least one counted line; a month of 0 everywhere has no day, and lands nothing.
  const day = days.length > 0 ? (days[Math.floor(days.length / 2)] as number) : 1;
  const amount = minorUnits(Number(low));
  if (low <= 0n) return { day, amount, months: keys.length, dates: [] };
  const end = addDays(asOf, CASH_PATH_DAYS_V3);
  const receivedNow = (inputs.months.find((m) => m.month === current)?.lines ?? []).some((l) => yearMonthOf(l.date) === current && counts(l));
  const dates: LocalDate[] = [];
  const lastYm = yearMonthOf(end);
  for (let i = 0, ym = current; ym <= lastYm; i++, ym = addYearMonths(current, i)) {
    if (ym === current && receivedNow) continue;
    const d = Math.min(day, daysInYearMonth(ym));
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    if (date > asOf && date < end) dates.push(date);
  }
  return { day, amount, months: keys.length, dates };
}
