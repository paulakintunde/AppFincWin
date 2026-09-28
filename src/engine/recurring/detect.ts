/**
 * Recurring-series suggestion after import (D-21). Groups rows by
 * normalised name, currency and sign, then looks for a regular interval
 * (weekly/fortnightly/monthly/quarterly/yearly) and an amount that never
 * strays more than 10% from the group's median. Transfer legs are never
 * offered (D-56).
 */
import { normaliseDescription } from '../categorize/guessCategory';
import type { RecurringFreq } from './schedule';

export interface RecurringDetectRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  localDate: string;
  isTransfer?: boolean;
}

export interface RecurringSuggestion {
  key: string;
  name: string;
  amount: number;
  currency: string;
  freq: RecurringFreq;
  anchorDate: string;
  rowIds: string[];
}

export const AMOUNT_TOLERANCE = 0.1;

export const INTERVAL_WINDOWS: Readonly<Record<RecurringFreq, readonly [number, number]>> = {
  weekly: [6, 8],
  fortnightly: [12, 16],
  monthly: [27, 33],
  quarterly: [85, 97],
  yearly: [360, 370],
};

export const MIN_ROWS: Readonly<Record<RecurringFreq, number>> = {
  weekly: 3,
  fortnightly: 3,
  monthly: 3,
  quarterly: 2,
  yearly: 2,
};

// Windows never overlap, so the first one containing every gap is the only one that can.
const FREQ_ORDER: readonly RecurringFreq[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

function parseLocalDateParts(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function daysBetween(a: string, b: string): number {
  const pa = parseLocalDateParts(a);
  const pb = parseLocalDateParts(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

function freqForGaps(gaps: readonly number[]): RecurringFreq | null {
  for (const freq of FREQ_ORDER) {
    const [lo, hi] = INTERVAL_WINDOWS[freq];
    if (gaps.every((g) => g >= lo && g <= hi)) return freq;
  }
  return null;
}

/** The lower of the two middle values on an even count, per the plan's tie-break. */
function lowerMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = n % 2 === 0 ? n / 2 - 1 : Math.floor(n / 2);
  return sorted[idx] as number;
}

/** Integer-maths 10% check: |a - median| * 10 <= |median|. */
function amountsWithinTolerance(amounts: readonly number[], median: number): boolean {
  const absMedian = Math.abs(median);
  return amounts.every((a) => Math.abs(a - median) * 10 <= absMedian);
}

interface Group {
  key: string;
  currency: string;
  rows: RecurringDetectRow[];
}

/**
 * Repeated payments with the same description, a similar amount and a
 * regular interval, as recurring suggestions the user can accept or
 * dismiss (D-21).
 */
export function detectRecurring(rows: readonly RecurringDetectRow[]): RecurringSuggestion[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.isTransfer === true) continue;
    const sign = Math.sign(row.amount);
    const key = `${normaliseDescription(row.name)}|${row.currency}|${sign}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { key, currency: row.currency, rows: [row] });
    } else {
      group.rows.push(row);
    }
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const group of groups.values()) {
    if (group.rows.length < 2) continue;

    const sorted = [...group.rows].sort((a, b) =>
      a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0
    );
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push(daysBetween(sorted[i - 1]!.localDate, sorted[i]!.localDate));
    }

    const freq = freqForGaps(gaps);
    if (freq === null) continue;
    if (sorted.length < MIN_ROWS[freq]) continue;

    const amounts = sorted.map((r) => r.amount);
    const median = lowerMedian(amounts);
    if (!amountsWithinTolerance(amounts, median)) continue;

    const last = sorted[sorted.length - 1] as RecurringDetectRow;
    suggestions.push({
      key: group.key,
      name: last.name,
      amount: median,
      currency: group.currency,
      freq,
      anchorDate: last.localDate,
      rowIds: sorted.map((r) => r.id),
    });
  }

  suggestions.sort((a, b) => {
    if (a.rowIds.length !== b.rowIds.length) return b.rowIds.length - a.rowIds.length;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return suggestions;
}
