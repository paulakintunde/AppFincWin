// 06.1-24: the pure rules behind setup items 1 and 2 (Pay and payday, Regular bills). No React, no I/O. Money stays in integer
// minor units; the monthly figure of a non-monthly bill is the engine's one half-up rounding.
import { monthlyEquivalent } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import type { RecurringFreq } from '@/engine/recurring';
import type { RecurringSeriesRow } from '@/db/rows';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import type { CandidateRow, CandidateState } from '@/features/decide/setup/steps/useRegularCandidates';

/**
 * Edits a saved series from a date on and returns the undo step id. Injected from src/shell/decide (the write path reaches the
 * exchange-rate fetch door, which the Decide feature may not import): the route passes the app's useEditSeriesFrom().editFrom.
 */
export type EditSeriesFrom = (input: {
  id: string;
  householdId: string;
  expectedVersion: number;
  patch: RecurringSeriesPatch;
  effectiveFrom: string;
  ownerId: string;
  name: string;
}) => string;

/** Days in a month of a `YYYY-MM` string. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The day of the month of a `YYYY-MM-DD` date. */
export function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

/** The same month and year with a new day of the month, held to the month's length (31 in a 30-day month is the 30th). */
export function anchorWithDay(anchor: string, day: number): string {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  return `${anchor.slice(0, 8)}${pad(Math.min(Math.max(1, day), daysIn(year, month)))}`;
}

/** The first date on or after `today` that falls on `day` of the month (held to the month's length). */
export function nextDateOnDay(today: string, day: number): string {
  const here = anchorWithDay(today, day);
  if (here >= today) return here;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return anchorWithDay(`${String(nextYear).padStart(4, '0')}-${pad(nextMonth)}-01`, day);
}

/** One line of the Regular bills list: a found payment, or a bill that exists only as a series (added by hand). */
export interface BillRow {
  readonly id: string;
  readonly name: string;
  /** Positive minor units of the payment. */
  readonly amount: number;
  readonly currency: string;
  readonly day: number;
  readonly freq: RecurringFreq;
  readonly state: CandidateState;
  readonly series: RecurringSeriesRow | null;
  /** The found payment behind the row; null for a series-only row. */
  readonly found: CandidateRow | null;
}

/**
 * The bills list: found payments that go out, then live expense series nothing was found for (a bill added by hand has no
 * logged rows yet). Saving and income series belong to other items and are left out. Sorted by day of the month.
 */
export function buildBillRows(found: readonly CandidateRow[], series: readonly RecurringSeriesRow[]): BillRow[] {
  const rows: BillRow[] = [];
  const covered = new Set<string>();
  for (const row of found) {
    if (row.candidate.direction !== 'out') continue;
    if (row.series !== null) covered.add(row.series.id);
    rows.push({
      id: row.id,
      name: row.candidate.name,
      amount: Math.abs(Number(row.candidate.amount)),
      currency: row.currency,
      day: dayOf(row.candidate.anchorDate),
      freq: row.freq,
      state: row.state,
      series: row.series,
      found: row,
    });
  }
  for (const s of series) {
    if (covered.has(s.id) || s.deleted_at !== null || s.amount >= 0) continue;
    if (s.income_kind != null || s.saving_mode != null) continue;
    if (seriesStatusOf(s).kind !== 'live') continue;
    rows.push({
      id: s.id,
      name: s.name,
      amount: Math.abs(s.amount),
      currency: s.currency,
      day: dayOf(s.anchor_date),
      freq: s.freq as RecurringFreq,
      state: 'regular',
      series: s,
      found: null,
    });
  }
  return rows.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
}

/** The monthly total of the rows marked Regular; Not regular and unmarked rows count nothing. */
export function regularMonthlyTotal(rows: readonly BillRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.state !== 'regular') continue;
    total += Number(monthlyEquivalent(minorUnits(r.amount), r.freq));
  }
  return total;
}

/** How many rows are marked Regular. */
export function regularCount(rows: readonly BillRow[]): number {
  return rows.filter((r) => r.state === 'regular').length;
}
