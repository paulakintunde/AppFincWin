// The Activity list's flat item structure (ACT-01, D-10): Still to come (pending rows and
// expected projections together), Paid, then Skipped. Pure, so FlashList's input is tested
// without rendering. Empty sections have no header.
// ACT-08: every subtotal comes from engine netOf; this file only arranges items.
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { groupByDay, groupByWeek, groupInOut, type ActivityGroup, type SortKey } from '@/engine/activity';

export type ActivitySection = 'pending' | 'paid' | 'skipped';

export type ActivityListView = 'list' | 'week' | 'split' | 'balance';

export interface RowBalance {
  moves: boolean;
  after: number | null;
}

export type ActivityItem =
  | { type: 'header'; key: string; section: ActivitySection }
  | {
      type: 'group';
      key: string;
      kind: 'day' | 'week' | 'in' | 'out';
      day?: string;
      week?: number;
      range?: { from: number; to: number };
      count: number;
      net: number;
      unconvertedCount: number;
    }
  | { type: 'row'; key: string; row: ActivityRowView; balance?: RowBalance }
  | { type: 'projection'; key: string; projection: ProjectionView };

function compareNewestFirst(a: ActivityRowView, b: ActivityRowView): number {
  if (a.local_date !== b.local_date) return a.local_date < b.local_date ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function buildActivityItems(rows: readonly ActivityRowView[], projections: readonly ProjectionView[]): ActivityItem[] {
  const pending: ActivityItem[] = [
    ...rows.filter((r) => r.status === 'pending').map((row): ActivityItem => ({ type: 'row', key: row.id, row })),
    ...projections.map((projection): ActivityItem => ({ type: 'projection', key: projection.key, projection })),
  ];
  const dateOf = (item: ActivityItem): string =>
    item.type === 'row' ? item.row.local_date : item.type === 'projection' ? item.projection.date : '';
  pending.sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) return da < db ? -1 : 1;
    // A real row before an expected one on the same day; then key order for stability.
    if (a.type !== b.type) return a.type === 'row' ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });

  const paid = rows.filter((r) => r.status === 'paid').sort(compareNewestFirst);
  const skipped = rows.filter((r) => r.status === 'skipped').sort(compareNewestFirst);

  const items: ActivityItem[] = [];
  const addSection = (section: ActivitySection, body: ActivityItem[]) => {
    if (body.length === 0) return;
    items.push({ type: 'header', key: `header:${section}`, section });
    items.push(...body);
  };
  addSection('pending', pending);
  addSection(
    'paid',
    paid.map((row): ActivityItem => ({ type: 'row', key: row.id, row }))
  );
  addSection(
    'skipped',
    skipped.map((row): ActivityItem => ({ type: 'row', key: row.id, row }))
  );
  return items;
}

export function getActivityItemType(item: ActivityItem): 'header' | 'group' | 'row' | 'projection' {
  return item.type;
}

/** A search result list: one flat newest-first list with no section headers. */
export function buildFlatItems(rows: readonly ActivityRowView[]): ActivityItem[] {
  return [...rows].sort(compareNewestFirst).map((row): ActivityItem => ({ type: 'row', key: row.id, row }));
}

function isBoundary(item: ActivityItem): boolean {
  return item.type === 'header' || item.type === 'group';
}

export type CardPositionOf = 'only' | 'first' | 'middle' | 'last';

/**
 * For each item, where it sits in its run of non-header items (a section or group is one
 * grouped card); null for a header or group header. Pure, so the list's card edges are tested
 * without rendering.
 */
export function cardPositions(items: readonly ActivityItem[]): (CardPositionOf | null)[] {
  return items.map((item, i) => {
    if (isBoundary(item)) return null;
    const prevIsRow = i > 0 && !isBoundary(items[i - 1]!);
    const nextIsRow = i < items.length - 1 && !isBoundary(items[i + 1]!);
    if (prevIsRow && nextIsRow) return 'middle';
    if (prevIsRow) return 'last';
    if (nextIsRow) return 'first';
    return 'only';
  });
}

function groupItem(g: ActivityGroup<ActivityRowView>, prefix: string): ActivityItem {
  return {
    type: 'group',
    key: `${prefix}group:${g.key}`,
    kind: g.kind,
    day: g.day,
    week: g.week,
    range: g.range,
    count: g.count,
    net: g.net,
    unconvertedCount: g.unconvertedCount,
  };
}

function groupedRows(
  groups: readonly ActivityGroup<ActivityRowView>[],
  prefix: string,
  balanceSteps?: ReadonlyMap<string, RowBalance>
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const g of groups) {
    items.push(groupItem(g, prefix));
    for (const row of g.rows) {
      const balance = balanceSteps?.get(row.id);
      items.push(balance === undefined ? { type: 'row', key: row.id, row } : { type: 'row', key: row.id, row, balance });
    }
  }
  return items;
}

export interface ViewItemsInput {
  view: ActivityListView;
  rows: readonly ActivityRowView[];
  projections: readonly ProjectionView[];
  sort: SortKey;
  month: string;
  weekStart: 0 | 1;
  balanceSteps?: ReadonlyMap<string, RowBalance>;
}

export function buildViewItems(input: ViewItemsInput): ActivityItem[] {
  const { view, rows, projections, sort, month, weekStart, balanceSteps } = input;
  if (view === 'week') return groupedRows(groupByWeek(rows, month, weekStart, sort), '');
  if (view === 'split') return groupedRows(groupInOut(rows, sort), '');
  // Running balance reads top to bottom in time order, so its order is fixed to oldest first.
  if (view === 'balance') return groupedRows(groupByDay(rows, 'oldest'), '', balanceSteps);

  const items: ActivityItem[] = [];
  const addSection = (section: ActivitySection, body: ActivityItem[]) => {
    if (body.length === 0) return;
    items.push({ type: 'header', key: `header:${section}`, section });
    items.push(...body);
  };
  const ofStatus = (status: ActivityRowView['status']) => rows.filter((r) => r.status === status);
  addSection('pending', [
    ...groupedRows(groupByDay(ofStatus('pending'), sort), 'pending:'),
    ...projections.map((projection): ActivityItem => ({ type: 'projection', key: projection.key, projection })),
  ]);
  addSection('paid', groupedRows(groupByDay(ofStatus('paid'), sort), 'paid:'));
  addSection('skipped', groupedRows(groupByDay(ofStatus('skipped'), sort), 'skipped:'));
  return items;
}
