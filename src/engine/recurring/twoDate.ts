/**
 * Pay on two fixed days a month (05.1 C2), moved here from the Decide detector (05.5-10, ARC-06).
 * Splits the dates of one payee into two monthly series. The gap window for "monthly" is detect.ts's, so
 * Activity and Decide agree on what a month is.
 */
import { TWO_DATE_TOLERANCE_DAYS } from '../decide/v3/constants';
import { daysBetween, daysInMonth, parseDate } from '../time/calendar';
import { INTERVAL_WINDOWS, lowerMedian } from './detect';

const TWO_DATE_MIN_ROWS = 3;
const TWO_DATE_MIN_CENTRE_GAP = 10;

function gapsOf(dates: readonly string[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) gaps.push(daysBetween(dates[i - 1] as string, dates[i] as string));
  return gaps;
}

/** Effective day for clustering: with `wrap`, a day within 3 of month-end counts as day 1 (31st of a 31-day month = 1). */
function effectiveDay(date: string, wrap: boolean): number {
  const { y, m, d } = parseDate(date);
  if (!wrap) return d;
  const dim = daysInMonth(y, m);
  return dim - d <= TWO_DATE_TOLERANCE_DAYS ? d - dim + 1 : d;
}

export interface TwoDateSplit {
  readonly days: readonly [number, number];
  readonly members: readonly [readonly string[], readonly string[]];
}

function splitByDay(dates: readonly string[], wrap: boolean): TwoDateSplit | null {
  const eff = dates.map((date) => ({ date, day: effectiveDay(date, wrap) }));
  const distinct = [...new Set(eff.map((e) => e.day))].sort((a, b) => a - b);
  for (let k = 0; k < distinct.length - 1; k += 1) {
    const cut = distinct[k] as number;
    const low = eff.filter((e) => e.day <= cut);
    const high = eff.filter((e) => e.day > cut);
    if (low.length < TWO_DATE_MIN_ROWS || high.length < TWO_DATE_MIN_ROWS) continue;
    const lowCentre = lowerMedian(low.map((e) => e.day));
    const highCentre = lowerMedian(high.map((e) => e.day));
    if (highCentre - lowCentre < TWO_DATE_MIN_CENTRE_GAP) continue;
    const near = (e: { day: number }, c: number): boolean => Math.abs(e.day - c) <= TWO_DATE_TOLERANCE_DAYS;
    if (!low.every((e) => near(e, lowCentre)) || !high.every((e) => near(e, highCentre))) continue;
    const [mLo, mHi] = INTERVAL_WINDOWS.monthly;
    const lowDates = low.map((e) => e.date).sort();
    const highDates = high.map((e) => e.date).sort();
    const monthlyOk = (ds: readonly string[]): boolean => gapsOf(ds).every((g) => g >= mLo && g <= mHi);
    if (!monthlyOk(lowDates) || !monthlyOk(highDates)) continue;
    return { days: [lowCentre, highCentre], members: [lowDates, highDates] };
  }
  return null;
}

/**
 * Splits the dates of one payee into two fixed days of the month (e.g. 1st and 15th, within 3 days each). Returns the
 * two cluster centres (day of month) and the dates of each cluster, or null when the dates are not two clean monthly series.
 */
export function twoDateClusters(dates: readonly string[]): TwoDateSplit | null {
  const sorted = [...dates].sort();
  return splitByDay(sorted, false) ?? splitByDay(sorted, true);
}
