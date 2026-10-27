/**
 * D-52 (as amended by D-57 and D-58), D-51, D-54 (05.1). Are the records good enough for Decide to give a verdict?
 * Pure: no clock (asOf comes from the inputs), no I/O. Reuses the records-look-behind arithmetic of needsInput and the
 * D-51 settle module; it adds no threshold of its own.
 *
 * With history, ready means: the previous calendar month is fully recorded AND the current month is up to date AND
 * every envelope says which account holds it. A person with no history who gave rough figures is always ready (D-57):
 * the answer is the rough one. A missed pay is never a readiness item (D-58); needsInput asks about it instead.
 * Readiness never changes the code, the split or any figure.
 */
import { NEEDS_INPUT_ENTRY_AGE_DAYS, MATCH_DAYS, UNDER_LOGGED_PACE_PERCENT } from './constants';
import { addDays, addYearMonths, daysBetween, yearMonthOf } from './dates';
import { classifyLine, seriesIndex, seriesOccurrences } from './month/series';
import { dueKey, matchWindowDays, settle, toPaidLine, type Due } from './month/settle';
import type { MonthModel, Readiness, ReadinessCode, V3Inputs, V3Line } from './types';

/** Bill occurrences with seriesId, date and amount in [from, to), and the match window per series. */
function billDues(inputs: V3Inputs, from: string, to: string): { readonly dues: readonly Due[]; readonly window: (id: string) => number } {
  const dues: Due[] = [];
  const windows = new Map<string, number>();
  for (const s of inputs.series) {
    if (s.role !== 'bill') continue;
    const dates = seriesOccurrences(s, from, to, inputs.asOf);
    if (dates.length === 0) continue;
    windows.set(s.id, matchWindowDays(s.cadence, MATCH_DAYS));
    for (const date of dates) dues.push({ seriesId: s.id, date, amount: s.amount });
  }
  return { dues, window: (id) => windows.get(id) as number };
}

function paidLines(inputs: V3Inputs): readonly V3Line[] {
  return inputs.months.flatMap((m) => m.lines.filter((l) => l.status === 'paid'));
}

function pastMonthMissing(inputs: V3Inputs, ym: string): boolean {
  const prev = addYearMonths(ym, -1);
  const prevMonth = inputs.months.find((m) => m.month === prev);
  if (prevMonth === undefined || !prevMonth.full) return true;
  const index = seriesIndex(inputs.series);
  const paid = prevMonth.lines.filter((l) => l.status === 'paid');
  if (!paid.some((l) => classifyLine(l, index) === 'everyday')) return true;
  const from = `${prev}-01`;
  const to = `${ym}-01`;
  const incomeDue = inputs.series.some((s) => (s.role === 'pay' || s.role === 'other_income') && seriesOccurrences(s, from, to, inputs.asOf).length > 0);
  if (incomeDue && !paid.some((l) => l.role === 'income')) return true;
  const { dues, window } = billDues(inputs, from, to);
  const { settled } = settle(dues, paidLines(inputs).map(toPaidLine), window);
  return dues.some((d) => !settled.has(dueKey(d)));
}

function activityNotCurrent(inputs: V3Inputs, month: MonthModel, ym: string): boolean {
  // Nothing recorded at all: there is no activity to be current about; past_month_missing already says so.
  if (!inputs.months.some((m) => m.lines.some((l) => l.status === 'paid'))) return false;
  const index = seriesIndex(inputs.series);
  let newest: string | null = null;
  for (const l of paidLines(inputs)) {
    if (l.role === 'spending' && classifyLine(l, index) === 'everyday' && (newest === null || l.date > newest)) newest = l.date;
  }
  const old = newest === null || daysBetween(newest, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS;
  const behind =
    month.e === null ||
    BigInt(month.everydayLogged) * BigInt(month.daysInMonth) * 100n < BigInt(UNDER_LOGGED_PACE_PERCENT) * BigInt(month.e) * BigInt(month.day);
  if (old && behind) return true;
  const { dues, window } = billDues(inputs, `${ym}-01`, addDays(inputs.asOf, 1));
  const { settled } = settle(dues, paidLines(inputs).map(toPaidLine), window);
  return dues.some((d) => daysBetween(d.date, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS && !settled.has(dueKey(d)));
}

export function readinessOf(inputs: V3Inputs, month: MonthModel): Readiness {
  const ym = yearMonthOf(inputs.asOf);
  // D-57: no history and rough figures given: the answer is the rough one.
  if (inputs.rough !== null && !inputs.months.some((m) => m.month < ym)) return { ready: true, missing: [] };
  const missing: ReadinessCode[] = [];
  if (pastMonthMissing(inputs, ym)) missing.push('past_month_missing');
  if (activityNotCurrent(inputs, month, ym)) missing.push('activity_not_current');
  // D-54: every envelope must say which account holds it.
  if (inputs.envelopes.some((e) => e.accountId === null || e.accountId === undefined)) missing.push('envelopes_unconfirmed');
  return { ready: missing.length === 0, missing: missing.sort() };
}
