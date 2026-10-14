import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { COMING_UP_LIMIT, selectComingUp } from '../comingUp';

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r',
    name: 'Bill',
    status: 'pending',
    transfer_id: null,
    is_refund: false,
    original_amount: -1000,
    local_date: '2026-10-10',
    amountHome: -1000,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

function proj(over: Partial<ProjectionView>): ProjectionView {
  return { key: 'p', seriesId: 's', date: '2026-10-12', name: 'Rent', amount: -5000, amountHome: -5000, ...over } as ProjectionView;
}

describe('selectComingUp', () => {
  it('keeps unpaid outgoing rows and outgoing projections only', () => {
    const { items, total } = selectComingUp(
      [
        row({ id: 'a' }),
        row({ id: 'income', original_amount: 5000 }),
        row({ id: 'xfer', transfer_id: 't1' }),
        row({ id: 'paid', status: 'paid' }),
        row({ id: 'skip', status: 'skipped' }),
      ],
      [proj({ key: 'out' }), proj({ key: 'in', amount: 100 })]
    );
    expect(total).toBe(2);
    expect(items.map((i) => (i.kind === 'row' ? i.row.id : i.projection.key))).toEqual(['a', 'out']);
  });

  it('orders by date, rows before projections on a tie, then by name', () => {
    const { items } = selectComingUp(
      [
        row({ id: 'late', local_date: '2026-10-20' }),
        row({ id: 'overdue', local_date: '2026-10-01' }),
        row({ id: 'same-b', local_date: '2026-10-12', name: 'B' }),
        row({ id: 'same-a', local_date: '2026-10-12', name: 'A' }),
      ],
      [proj({ key: 'p', date: '2026-10-12' })],
      10
    );
    expect(items.map((i) => (i.kind === 'row' ? i.row.id : i.projection.key))).toEqual([
      'overdue',
      'same-a',
      'same-b',
      'p',
      'late',
    ]);
  });

  it('limits to COMING_UP_LIMIT but reports the full total', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ id: `r${i}`, local_date: `2026-10-0${i + 1}` }));
    const { items, total } = selectComingUp(rows, []);
    expect(COMING_UP_LIMIT).toBe(4);
    expect(items).toHaveLength(4);
    expect(total).toBe(6);
  });
});
