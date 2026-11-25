/**
 * Calendar cells for the Activity Calendar view (ACT-06, UI-SPEC 1 Calendar):
 * leading blanks per week start, each day once, up to 3 category dots and the
 * day's net. Trailing blanks pad the grid to a multiple of 7.
 */
import { daysInMonth } from '../time/calendar';
import { expandParts, type Part } from '../parts';
import { netOf, type GroupRow } from './groups';
import { firstWeekdayOffset } from './weeks';

export type CalendarCell =
  | { kind: 'blank'; key: string }
  | {
      kind: 'day';
      key: string;
      date: string;
      day: number;
      count: number;
      net: number;
      unconvertedCount: number;
      dots: (string | null)[];
    };

export const MAX_CALENDAR_DOTS = 3;

/** Day-of-week numbers (0 Sunday) in header order for the week start. */
export function weekdayOrder(weekStart: 0 | 1): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7);
}

export function calendarCells<T extends GroupRow & { category_id: string | null; parts?: readonly Part[] | null }>(
  month: string,
  weekStart: 0 | 1,
  rows: readonly T[]
): CalendarCell[] {
  const lead = firstWeekdayOffset(month, weekStart);
  const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const byDay = new Map<number, T[]>();
  for (const row of rows) {
    const d = Number(row.local_date.slice(8, 10));
    const list = byDay.get(d);
    if (list === undefined) byDay.set(d, [row]);
    else list.push(row);
  }
  const cells: CalendarCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ kind: 'blank', key: `lead-${i}` });
  for (let day = 1; day <= dim; day++) {
    const list = byDay.get(day) ?? [];
    const dots: (string | null)[] = [];
    for (const row of list) {
      const counts = row.transfer_id === null && row.status !== 'skipped';
      if (!counts) continue;
      // 10.1-10 (D-05): every part's category (and the gap, as null) gets a dot.
      const cats = expandParts({ id: row.id, amount: row.original_amount, categoryId: row.category_id, parts: row.parts ?? null });
      for (const c of cats) {
        if (dots.length === MAX_CALENDAR_DOTS) break;
        if (!dots.includes(c.categoryId)) dots.push(c.categoryId);
      }
    }
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ kind: 'day', key: date, date, day, dots, ...netOf(list) });
  }
  let trail = 0;
  while (cells.length % 7 !== 0) cells.push({ kind: 'blank', key: `trail-${trail++}` });
  return cells;
}
