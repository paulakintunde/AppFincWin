import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { buildActivityItems, getActivityItemType } from '../activitySections';

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -100,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-09-10',
    name: 'x',
    category_id: null,
    payment_type: null,
    status: 'paid',
    note: null,
    transfer_id: null,
    created_at: '2026-09-10T10:00:00Z',
    amountHome: -100,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

function proj(key: string, date: string): ProjectionView {
  return {
    key,
    seriesId: 's',
    date,
    name: 'Rent',
    amount: -500,
    currency: 'GBP',
    categoryId: null,
    accountId: 'a1',
    amountHome: -500,
  };
}

describe('buildActivityItems', () => {
  it('orders pending rows and projections by date ascending under one header', () => {
    const items = buildActivityItems(
      [row({ id: 'p2', status: 'pending', local_date: '2026-09-20' }), row({ id: 'p1', status: 'pending', local_date: '2026-09-05' })],
      [proj('s:2026-09-12', '2026-09-12')]
    );
    expect(items.map((i) => i.key)).toEqual(['header:pending', 'p1', 's:2026-09-12', 'p2']);
  });

  it('orders paid rows newest first with created_at as the tie-break', () => {
    const items = buildActivityItems(
      [
        row({ id: 'a', local_date: '2026-09-10', created_at: '2026-09-10T08:00:00Z' }),
        row({ id: 'b', local_date: '2026-09-10', created_at: '2026-09-10T12:00:00Z' }),
        row({ id: 'c', local_date: '2026-09-15' }),
      ],
      []
    );
    expect(items.map((i) => i.key)).toEqual(['header:paid', 'c', 'b', 'a']);
  });

  it('puts skipped rows last and omits empty sections', () => {
    const items = buildActivityItems([row({ id: 's1', status: 'skipped' }), row({ id: 'p1' })], []);
    expect(items.map((i) => i.key)).toEqual(['header:paid', 'p1', 'header:skipped', 's1']);
    expect(buildActivityItems([], [])).toEqual([]);
  });

  it('reports item types for the list recycler', () => {
    const items = buildActivityItems([row({ id: 'p1', status: 'pending' })], [proj('k', '2026-09-30')]);
    expect(items.map(getActivityItemType)).toEqual(['header', 'row', 'projection']);
  });
});
