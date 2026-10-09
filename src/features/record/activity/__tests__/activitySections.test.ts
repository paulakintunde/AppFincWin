import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { buildActivityItems, buildViewItems, cardPositions, getActivityItemType } from '../activitySections';

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

describe('cardPositions', () => {
  it('marks each row as first, middle, last or only within its section; headers get null', () => {
    const items = buildActivityItems(
      [row({ id: 'a', status: 'pending' }), row({ id: 'b' }), row({ id: 'c' }), row({ id: 'd' })],
      []
    );
    expect(cardPositions(items)).toEqual([null, 'only', null, 'first', 'middle', 'last']);
  });

  it('returns an empty list for no items', () => {
    expect(cardPositions([])).toEqual([]);
  });
});

describe('buildViewItems', () => {
  const base = { projections: [], sort: 'newest' as const, month: '2026-10', weekStart: 1 as const };
  const shape = (items: ReturnType<typeof buildViewItems>) =>
    items.map((i) =>
      i.type === 'header' ? `H:${i.section}` : i.type === 'group' ? `G:${i.kind}:${i.day ?? i.week ?? ''}` : i.type === 'row' ? `R:${i.row.id}` : `P:${i.key}`
    );

  it('list view: sections with day groups inside, projections in pending', () => {
    const rows = [
      row({ id: 'a', local_date: '2026-10-03' }),
      row({ id: 'b', local_date: '2026-10-05' }),
      row({ id: 'c', local_date: '2026-10-09', status: 'pending' }),
    ];
    const items = buildViewItems({ ...base, view: 'list', rows, projections: [proj('p', '2026-10-20')] });
    expect(shape(items)).toEqual(['H:pending', 'G:day:2026-10-09', 'R:c', 'P:p', 'H:paid', 'G:day:2026-10-05', 'R:b', 'G:day:2026-10-03', 'R:a']);
  });

  it('week view: weeks with ranges, no empty weeks, no sections or projections', () => {
    const rows = [row({ id: 'a', local_date: '2026-10-02' }), row({ id: 'b', local_date: '2026-10-03' }), row({ id: 'c', local_date: '2026-10-20' })];
    const items = buildViewItems({ ...base, view: 'week', rows, projections: [proj('p', '2026-10-20')], sort: 'oldest' });
    expect(shape(items)).toEqual(['G:week:1', 'R:a', 'R:b', 'G:week:4', 'R:c']);
    const g = items[0];
    expect(g?.type === 'group' && g.range).toEqual({ from: 1, to: 4 });
    expect(g?.type === 'group' && g.count).toBe(2);
    expect(g?.type === 'group' && g.net).toBe(-200);
  });

  it('split view: In then Out, refund in Out, transfers omitted', () => {
    const rows = [
      row({ id: 'in', original_amount: 500, amountHome: 500 }),
      row({ id: 'out', original_amount: -100 }),
      row({ id: 'ref', original_amount: 50, amountHome: 50, is_refund: true } as Partial<ActivityRowView>),
      row({ id: 'tr', transfer_id: 't1' }),
    ];
    const s = shape(buildViewItems({ ...base, view: 'split', rows }));
    expect(s[0]).toBe('G:in:');
    expect(s).not.toContain('R:tr');
    expect(s.indexOf('R:ref')).toBeGreaterThan(s.indexOf('G:out:'));
  });

  it('balance view: oldest first with balance steps attached', () => {
    const rows = [row({ id: 'a', local_date: '2026-10-05' }), row({ id: 'b', local_date: '2026-10-03' })];
    const steps = new Map([
      ['b', { moves: true, after: 900 }],
      ['a', { moves: true, after: 800 }],
    ]);
    const items = buildViewItems({ ...base, view: 'balance', rows, balanceSteps: steps });
    expect(shape(items)).toEqual(['G:day:2026-10-03', 'R:b', 'G:day:2026-10-05', 'R:a']);
    const first = items[1];
    expect(first?.type === 'row' && first.balance).toEqual({ moves: true, after: 900 });
  });

  it('group items are boundaries for cardPositions and typed group', () => {
    const rows = [row({ id: 'a', local_date: '2026-10-03' }), row({ id: 'b', local_date: '2026-10-03' }), row({ id: 'c', local_date: '2026-10-04' })];
    const items = buildViewItems({ ...base, view: 'week', rows });
    expect(getActivityItemType(items[0]!)).toBe('group');
    expect(cardPositions(items)).toEqual([null, 'first', 'middle', 'last']);
  });
});
