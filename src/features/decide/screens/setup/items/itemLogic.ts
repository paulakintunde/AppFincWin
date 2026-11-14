// 06.1-24: the pure rules behind setup items 1 and 2 (Pay and payday, Regular bills). No React, no I/O. Money stays in integer
// minor units; the monthly figure of a non-monthly bill is the engine's one half-up rounding.
import type { V3Inputs, V3Series } from '@/engine/decide/v3';
import type { RecurringFreq } from '@/engine/recurring';
import type { RecurringSeriesRow } from '@/db/rows';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import type { CandidateRow, CandidateState } from '@/features/decide/screens/setup/items/useRegularCandidates';

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

/**
 * 06.1-75 (OQ-75-1 A): stops a bill series from a date on (end_date the day before, end_reason 'stopped'; past entries stay) and returns
 * the undo step id. Injected from src/shell/decide like EditSeriesFrom: the route passes useSetSeriesStatus().stop.
 */
export type StopBill = (series: RecurringSeriesRow, from: string, ownerId: string) => string;

/**
 * 06.1-75: the first day a stopped bill no longer counts: today, or its first date when that is still to come (the server refuses a
 * stop before the start, and a bill that has not started yet then never runs).
 */
export function stopFromFor(series: Pick<RecurringSeriesRow, 'anchor_date'>, today: string): string {
  return series.anchor_date > today ? series.anchor_date : today;
}

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

/**
 * 06.1-75 (DS-6, DS-7): the bills Decide counts, read from the v3 inputs, so the bills page and the setup checklist show one set and one
 * total. `monthly` is each counted bill's monthly figure in the home currency (the converted amount Decide uses), keyed by series id.
 * `elsewhere` holds the series Decide counts under another role (saving or investing) or as a debt's payment. A series that feeds a live
 * goal never reaches the inputs (buildV3Inputs, ARC-15): its goal_id marks it on the page (billCountOf).
 */
export interface DecideBillSet {
  readonly monthly: ReadonlyMap<string, number>;
  readonly elsewhere: ReadonlySet<string>;
  readonly currency: string;
}

/** A monthly figure for a series: weekly amounts are spread over a 52-week year. */
export function billMonthlyMinor(s: Pick<V3Series, 'amount' | 'cadence'>): number {
  const every = Math.max(1, s.cadence.every);
  return s.cadence.unit === 'month' ? Math.round(Number(s.amount) / every) : Math.round((Number(s.amount) * 52) / 12 / every);
}

export function decideBillSetOf(inputs: Pick<V3Inputs, 'series' | 'debts' | 'currency'>): DecideBillSet {
  const monthly = new Map<string, number>();
  const elsewhere = new Set<string>();
  for (const s of inputs.series) {
    if (s.role === 'bill' && s.status === 'live') monthly.set(s.id, billMonthlyMinor(s));
    else if (s.role === 'saving' || s.role === 'investing') elsewhere.add(s.id);
  }
  for (const d of inputs.debts) if (d.seriesId != null) elsewhere.add(d.seriesId);
  return { monthly, elsewhere, currency: inputs.currency };
}

/** The monthly total of the bills Decide counts, in the home currency. */
export function decideBillsTotal(set: DecideBillSet): number {
  let total = 0;
  for (const m of set.monthly.values()) total += m;
  return total;
}

/**
 * How Decide counts a saved series: as a bill, elsewhere (a saving, goal or debt payment, counted once in its own place), or not yet
 * (no stored rate converts it, or it is not live in Decide).
 */
export type BillCount = 'bill' | 'elsewhere' | 'notCounted';

export function billCountOf(series: Pick<RecurringSeriesRow, 'id' | 'goal_id'>, set: DecideBillSet): BillCount {
  if (set.monthly.has(series.id)) return 'bill';
  if (set.elsewhere.has(series.id) || (series.goal_id ?? null) !== null) return 'elsewhere';
  return 'notCounted';
}

/** One line of the Regular bills list: a found payment, or a bill that exists only as a series (added by hand). */
export interface BillRow {
  readonly id: string;
  readonly name: string;
  /** Positive minor units of the payment, in the row's own currency: the saved bill's amount once there is one. */
  readonly amount: number;
  readonly currency: string;
  readonly day: number;
  readonly freq: RecurringFreq;
  readonly state: CandidateState;
  readonly series: RecurringSeriesRow | null;
  /** The found payment behind the row; null for a series-only row. */
  readonly found: CandidateRow | null;
  /** 06.1-75: how Decide counts the saved bill; null with no saved bill or before the Decide inputs are read. */
  readonly counted: BillCount | null;
  /** 06.1-75 (DS-15): a counted bill the user has not confirmed yet ("These are right" not answered). */
  readonly toConfirm: boolean;
}

/**
 * The bills list: found payments that go out, then expense series nothing was found for (a bill added by hand has no logged rows
 * yet). Saving and income series belong to other items and are left out. A row with a saved bill shows that bill's amount, day and
 * frequency (DC-5: a change shows at once). With the Decide set, every bill Decide counts is listed, and each saved row says how
 * Decide counts it. Rows to confirm come first (DS-15), then by day of the month.
 */
export function buildBillRows(
  found: readonly CandidateRow[],
  series: readonly RecurringSeriesRow[],
  set: DecideBillSet | null = null,
  billsRight = true,
): BillRow[] {
  const rows: BillRow[] = [];
  const covered = new Set<string>();
  const countOf = (s: RecurringSeriesRow | null): BillCount | null => (s === null || set === null ? null : billCountOf(s, set));
  const confirmOf = (c: BillCount | null): boolean => !billsRight && c === 'bill';
  for (const row of found) {
    if (row.candidate.direction !== 'out') continue;
    const s = row.series;
    if (s !== null) covered.add(s.id);
    const counted = countOf(s);
    rows.push({
      id: row.id,
      name: row.candidate.name,
      amount: Math.abs(s !== null ? s.amount : Number(row.candidate.amount)),
      currency: s !== null ? s.currency : row.currency,
      day: dayOf(s !== null ? s.anchor_date : row.candidate.anchorDate),
      freq: s !== null ? (s.freq as RecurringFreq) : row.freq,
      state: row.state,
      series: s,
      found: row,
      counted,
      toConfirm: confirmOf(counted),
    });
  }
  for (const s of series) {
    if (covered.has(s.id) || s.deleted_at !== null || s.amount >= 0) continue;
    covered.add(s.id);
    const counted = countOf(s);
    // Every bill Decide counts is listed, so the page and the checklist count the same set (DS-6).
    if (counted !== 'bill') {
      if (s.income_kind != null || s.saving_mode != null) continue;
      if (seriesStatusOf(s).kind !== 'live') continue;
    }
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
      counted,
      toConfirm: confirmOf(counted),
    });
  }
  return rows.sort((a, b) => Number(b.toConfirm) - Number(a.toConfirm) || a.day - b.day || a.name.localeCompare(b.name));
}

/** How many rows are marked Regular. */
export function regularCount(rows: readonly BillRow[]): number {
  return rows.filter((r) => r.state === 'regular').length;
}
