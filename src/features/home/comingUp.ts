// HOME-03 / D-34 / D-36: what Home lists under Coming up. Same definition of 'bill still due' as
// Activity's Unpaid filter (isUnpaidBill, 03-17) plus projected recurring bills. Not money maths:
// selection and ordering only.
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { isUnpaidBill } from '@/engine/activity';

export const COMING_UP_LIMIT = 4;

export type ComingUpItem =
  | { kind: 'row'; row: ActivityRowView; date: string }
  | { kind: 'projection'; projection: ProjectionView; date: string };

function nameOf(item: ComingUpItem): string {
  return (item.kind === 'row' ? item.row.name : item.projection.name) ?? '';
}

export function selectComingUp(
  rows: readonly ActivityRowView[],
  projections: readonly ProjectionView[],
  limit: number = COMING_UP_LIMIT
): { items: ComingUpItem[]; total: number } {
  const all: ComingUpItem[] = [
    ...rows.filter((r) => isUnpaidBill(r)).map((row): ComingUpItem => ({ kind: 'row', row, date: row.local_date })),
    ...projections
      .filter((p) => p.amount < 0)
      .map((projection): ComingUpItem => ({ kind: 'projection', projection, date: projection.date })),
  ];
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'row' ? -1 : 1;
    const an = nameOf(a);
    const bn = nameOf(b);
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  return { items: all.slice(0, limit), total: all.length };
}
