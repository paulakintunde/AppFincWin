// The Activity list's flat item structure (ACT-01, D-10): Still to come (pending rows and
// expected projections together), Paid, then Skipped. Pure, so FlashList's input is tested
// without rendering. Empty sections have no header.
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';

export type ActivitySection = 'pending' | 'paid' | 'skipped';

export type ActivityItem =
  | { type: 'header'; key: string; section: ActivitySection }
  | { type: 'row'; key: string; row: ActivityRowView }
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

export function getActivityItemType(item: ActivityItem): 'header' | 'row' | 'projection' {
  return item.type;
}

/** A search result list: one flat newest-first list with no section headers. */
export function buildFlatItems(rows: readonly ActivityRowView[]): ActivityItem[] {
  return [...rows].sort(compareNewestFirst).map((row): ActivityItem => ({ type: 'row', key: row.id, row }));
}
