/**
 * 05-06 Task 1: which months are FULL (04 D-13, OQ3 / A3). The engine never infers fullness; this rule is the builder's.
 *
 * A month is full only when all of these hold:
 *   - it is before today's month (the current month is never full);
 *   - it has at least one live row;
 *   - the app has coverage of it end to end: either the earliest live row sits on or before the month's 1st (a
 *     1st-of-month coverage start), or one imported statement period covers the month from its 1st to its last day.
 *
 * Pure string arithmetic on 'YYYY-MM' / 'YYYY-MM-DD'; never Date#toISOString (MON-14).
 */
import { daysInMonth } from '@/engine/recurring/schedule';
import { monthOf } from '@/engine/time';

export interface FullMonthInput {
  today: string;
  rowDates: readonly { date: string; accountId: string }[];
  periods: readonly { accountId: string; start: string; end: string }[];
  lookbackMonths: number;
}

/** 'YYYY-MM' shifted by `delta` months (delta may be negative). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-') as [string, string];
  const index = Number(y) * 12 + (Number(m) - 1) + delta;
  const year = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

export function fullMonthFlags(input: FullMonthInput): Map<string, boolean> {
  const current = monthOf(input.today);
  const rowMonths = new Set<string>();
  let earliest: string | null = null;
  for (const r of input.rowDates) {
    rowMonths.add(r.date.slice(0, 7));
    if (earliest === null || r.date < earliest) earliest = r.date;
  }

  const flags = new Map<string, boolean>();
  for (let back = input.lookbackMonths; back >= 0; back -= 1) {
    const month = shiftMonth(current, -back);
    if (month >= current || !rowMonths.has(month) || earliest === null) {
      flags.set(month, false);
      continue;
    }
    const first = `${month}-01`;
    const [y, m] = month.split('-') as [string, string];
    const last = `${month}-${String(daysInMonth(Number(y), Number(m))).padStart(2, '0')}`;
    const startedOnTheFirst = first >= earliest;
    const covered = input.periods.some((p) => p.start <= first && p.end >= last);
    flags.set(month, startedOnTheFirst || covered);
  }
  return flags;
}
