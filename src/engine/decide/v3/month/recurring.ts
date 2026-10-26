/**
 * v3 recurring candidates (05.1 S1, v3 §4.1, D-02, D-21, C2). Ported from recurring/detect.ts, which stays unchanged for
 * Record's import offers. This is the ONLY v3 file allowed to import recurring/detect, recurring/offer or categorize;
 * candidates are for setup only and never reach the verdict path (I34).
 */
import { minorUnits } from '../../../money/types';
import { offerKey } from '../../../recurring/offer';
import {
  AMOUNT_TOLERANCE_DIVISOR,
  RECURRING_MIN_REPEATS,
  RECURRING_WINDOWS,
  TWO_DATE_TOLERANCE_DAYS,
} from '../constants';
import { daysBetween, daysInYearMonth, dayOfMonth, yearMonthOf } from '../dates';
import type { Cadence, RecurringCandidate } from '../types';

export interface DetectRow {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly isTransfer: boolean;
  readonly accountId: string | null;
}

export interface DetectContext {
  readonly dismissedKeys: ReadonlySet<string>;
  readonly linkedRowIds: ReadonlySet<string>;
}

type Freq = keyof typeof RECURRING_WINDOWS;

// Windows never overlap, so the first one containing every gap is the only one that can.
const FREQ_ORDER: readonly Freq[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

const CADENCE_OF: Readonly<Record<Freq, Cadence>> = {
  weekly: { unit: 'week', every: 1 },
  fortnightly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'month', every: 12 },
};

const MONTHLY_CADENCE = CADENCE_OF.monthly;
const TWO_DATE_MIN_ROWS = 3;
const TWO_DATE_MIN_CENTRE_GAP = 10;
const TWO_DATE_SUFFIX = '#two-dates';

/** The lower of the two middle values on an even count (detect.ts rule). */
function lowerMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return sorted[n % 2 === 0 ? n / 2 - 1 : Math.floor(n / 2)] as number;
}

function amountsWithinTolerance(amounts: readonly number[], median: number): boolean {
  const absMedian = Math.abs(median);
  return amounts.every((a) => Math.abs(a - median) * AMOUNT_TOLERANCE_DIVISOR <= absMedian);
}

function gapsOf(dates: readonly string[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) gaps.push(daysBetween(dates[i - 1] as string, dates[i] as string));
  return gaps;
}

function freqForGaps(gaps: readonly number[]): Freq | null {
  for (const freq of FREQ_ORDER) {
    const [lo, hi] = RECURRING_WINDOWS[freq];
    if (gaps.every((g) => g >= lo && g <= hi)) return freq;
  }
  return null;
}

/** Effective day for clustering: with `wrap`, a day within 3 of month-end counts as day 1 (31st of a 31-day month = 1). */
function effectiveDay(date: string, wrap: boolean): number {
  const d = dayOfMonth(date);
  if (!wrap) return d;
  const dim = daysInYearMonth(yearMonthOf(date));
  return dim - d <= TWO_DATE_TOLERANCE_DAYS ? d - dim + 1 : d;
}

interface Split {
  readonly days: readonly [number, number];
  readonly members: readonly [readonly string[], readonly string[]];
}

function splitByDay(dates: readonly string[], wrap: boolean): Split | null {
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
    const [mLo, mHi] = RECURRING_WINDOWS.monthly;
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
export function twoDateClusters(
  dates: readonly string[]
): { readonly days: readonly [number, number]; readonly members: readonly [readonly string[], readonly string[]] } | null {
  const sorted = [...dates].sort();
  return splitByDay(sorted, false) ?? splitByDay(sorted, true);
}

interface Group {
  readonly key: string;
  readonly direction: 'in' | 'out';
  readonly rows: DetectRow[];
}

function byDateThenId(a: DetectRow, b: DetectRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function candidateFrom(
  group: Group,
  rows: readonly DetectRow[],
  cadence: Cadence,
  payGroupKey: string | null
): RecurringCandidate | null {
  const amounts = rows.map((r) => r.amount);
  const median = lowerMedian(amounts);
  if (!amountsWithinTolerance(amounts, median)) return null;
  const last = rows[rows.length - 1] as DetectRow;
  return {
    key: group.key,
    name: last.name,
    direction: group.direction,
    cadence,
    anchorDate: last.date,
    amount: minorUnits(Math.abs(median)),
    rowIds: rows.map((r) => r.id),
    payGroupKey,
  };
}

/** Candidate series from logged rows: every cadence, plus pay on two fixed dates a month (checked first, C2). */
export function detectCandidates(rows: readonly DetectRow[], ctx: DetectContext): readonly RecurringCandidate[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.isTransfer || row.amount === 0) continue;
    const key = offerKey(row.name, row.currency, row.amount);
    const groupKey = `${key}|${row.accountId ?? ''}`;
    const group = groups.get(groupKey);
    if (group === undefined) groups.set(groupKey, { key, direction: row.amount > 0 ? 'in' : 'out', rows: [row] });
    else group.rows.push(row);
  }

  const out: RecurringCandidate[] = [];
  for (const group of groups.values()) {
    if (ctx.dismissedKeys.has(group.key)) continue;
    if (group.rows.some((r) => ctx.linkedRowIds.has(r.id))) continue;
    const sorted = [...group.rows].sort(byDateThenId);
    if (sorted.length < 2) continue;

    const clusters = twoDateClusters(sorted.map((r) => r.date));
    if (clusters !== null) {
      const payGroupKey = group.key + TWO_DATE_SUFFIX;
      const lowSet = new Set(clusters.members[0]);
      const lowRows = sorted.filter((r) => lowSet.has(r.date));
      const highRows = sorted.filter((r) => !lowSet.has(r.date));
      const a = candidateFrom(group, lowRows, MONTHLY_CADENCE, payGroupKey);
      const b = candidateFrom(group, highRows, MONTHLY_CADENCE, payGroupKey);
      if (a !== null && b !== null) {
        out.push(a, b);
        continue;
      }
    }

    const freq = freqForGaps(gapsOf(sorted.map((r) => r.date)));
    if (freq === null || sorted.length < RECURRING_MIN_REPEATS[freq]) continue;
    const single = candidateFrom(group, sorted, CADENCE_OF[freq], null);
    if (single !== null) out.push(single);
  }

  out.sort((x, y) => {
    if (x.rowIds.length !== y.rowIds.length) return y.rowIds.length - x.rowIds.length;
    if (x.name !== y.name) return x.name < y.name ? -1 : 1;
    if (x.key !== y.key) return x.key < y.key ? -1 : 1;
    if (x.anchorDate !== y.anchorDate) return x.anchorDate < y.anchorDate ? -1 : 1;
    // Same payee on two accounts can tie on everything above: break it on the first row id so the order never
    // depends on input order (I16).
    const xr = x.rowIds[0] as string;
    const yr = y.rowIds[0] as string;
    return xr < yr ? -1 : xr > yr ? 1 : 0;
  });
  return out;
}
