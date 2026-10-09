/**
 * Activity grouping (ACT-07, ACT-08). netOf is the single owner of every group
 * subtotal (UI-SPEC 1): the signed home-currency sum of non-transfer,
 * non-skipped lines (income and refunds positive, expenses negative). A null
 * amountHome is counted in unconvertedCount and never silently dropped.
 *
 * Group order is always chronological (newest first, oldest first only for the
 * 'oldest' sort); the sort key orders rows inside each group (UI-SPEC 2).
 * Transfers appear in day and week groups but add nothing to a net, and appear
 * in neither In nor Out. Rows must belong to the month passed to groupByWeek.
 */
import { flowOf } from './filters';
import { sortRows, type SortKey, type SortRow } from './sort';
import { weekOfMonth, weekRange } from './weeks';

export interface GroupRow extends SortRow {
  status: 'paid' | 'pending' | 'skipped';
  transfer_id: string | null;
  is_refund?: boolean;
}

export interface GroupNet {
  net: number;
  count: number;
  unconvertedCount: number;
}

export interface ActivityGroup<T extends GroupRow> extends GroupNet {
  key: string;
  kind: 'day' | 'week' | 'in' | 'out';
  rows: T[];
  day?: string;
  week?: number;
  range?: { from: number; to: number };
}

export function netOf(rows: readonly GroupRow[]): GroupNet {
  let net = 0;
  let count = 0;
  let unconvertedCount = 0;
  for (const row of rows) {
    if (row.transfer_id !== null || row.status === 'skipped') continue;
    count++;
    if (row.amountHome === null) {
      unconvertedCount++;
    } else {
      net += row.amountHome;
    }
  }
  return { net, count, unconvertedCount };
}

function bucket<T>(rows: readonly T[], keyOf: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = keyOf(row);
    const list = map.get(k);
    if (list === undefined) map.set(k, [row]);
    else list.push(row);
  }
  return map;
}

/** -1 = newest first (default), 1 = oldest first. */
function chronological(sort: SortKey): 1 | -1 {
  return sort === 'oldest' ? 1 : -1;
}

export function groupByDay<T extends GroupRow>(
  rows: readonly T[],
  sort: SortKey
): ActivityGroup<T>[] {
  const dir = chronological(sort);
  return [...bucket(rows, (r) => r.local_date).entries()]
    .sort(([a], [b]) => (a < b ? -dir : dir))
    .map(([day, list]) => ({
      key: day,
      kind: 'day' as const,
      day,
      rows: sortRows(list, sort),
      ...netOf(list),
    }));
}

export function groupByWeek<T extends GroupRow>(
  rows: readonly T[],
  month: string,
  weekStart: 0 | 1,
  sort: SortKey
): ActivityGroup<T>[] {
  const dir = chronological(sort);
  const weekOf = (r: T): string =>
    String(weekOfMonth(month, Number(r.local_date.slice(8, 10)), weekStart));
  return [...bucket(rows, weekOf).entries()]
    .map(([w, list]) => ({ week: Number(w), list }))
    .sort((a, b) => (a.week - b.week) * dir)
    .map(({ week, list }) => ({
      key: `week-${week}`,
      kind: 'week' as const,
      week,
      range: weekRange(month, week, weekStart),
      rows: sortRows(list, sort),
      ...netOf(list),
    }));
}

export function groupInOut<T extends GroupRow>(
  rows: readonly T[],
  sort: SortKey
): ActivityGroup<T>[] {
  const ins: T[] = [];
  const outs: T[] = [];
  for (const row of rows) {
    const flow = flowOf({
      original_amount: row.original_amount,
      transfer_id: row.transfer_id,
      is_refund: row.is_refund,
    });
    if (flow === 'in') ins.push(row);
    else if (flow === 'out') outs.push(row);
  }
  const make = (kind: 'in' | 'out', list: T[]): ActivityGroup<T>[] =>
    list.length === 0 ? [] : [{ key: kind, kind, rows: sortRows(list, sort), ...netOf(list) }];
  return [...make('in', ins), ...make('out', outs)];
}
