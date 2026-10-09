import fc from 'fast-check';
import { groupByDay, groupByWeek, groupInOut, netOf, type GroupRow } from '../groups';
import { SORT_KEYS } from '../sort';

const row = (id: string, o: Partial<GroupRow> = {}): GroupRow => ({
  id,
  local_date: '2026-10-01',
  created_at: '2026-10-01T00:00:00Z',
  name: null,
  original_amount: -100,
  amountHome: -100,
  status: 'paid',
  transfer_id: null,
  ...o,
});

describe('netOf', () => {
  it('signs income, refunds and expenses; skips transfers and skipped', () => {
    const r = netOf([
      row('a', { amountHome: -500 }),
      row('b', { amountHome: 200, is_refund: true }),
      row('c', { amountHome: 1000, original_amount: 1000 }),
      row('d', { transfer_id: 't' }),
      row('e', { status: 'skipped' }),
    ]);
    expect(r).toEqual({ net: 700, count: 3, unconvertedCount: 0 });
  });

  it('counts null amounts as unconverted', () => {
    expect(netOf([row('a', { amountHome: null }), row('b', { amountHome: -5 })])).toEqual({
      net: -5,
      count: 2,
      unconvertedCount: 1,
    });
  });
});

describe('groupByDay', () => {
  const rs = [
    row('a', { local_date: '2026-10-02' }),
    row('b', { local_date: '2026-10-03', amountHome: -50 }),
    row('c', { local_date: '2026-10-03', amountHome: -900 }),
  ];
  it('newest first by default, oldest first for oldest', () => {
    expect(groupByDay(rs, 'newest').map((g) => g.key)).toEqual(['2026-10-03', '2026-10-02']);
    expect(groupByDay(rs, 'oldest').map((g) => g.key)).toEqual(['2026-10-02', '2026-10-03']);
  });
  it('sorts rows inside groups and keeps group order chronological', () => {
    const g = groupByDay(rs, 'biggest');
    expect(g.map((x) => x.key)).toEqual(['2026-10-03', '2026-10-02']);
    expect(g[0]?.rows.map((r) => r.id)).toEqual(['c', 'b']);
    expect(g[0]).toMatchObject({ kind: 'day', day: '2026-10-03', net: -950, count: 2 });
  });
});

describe('groupByWeek', () => {
  const rs = [
    row('a', { local_date: '2026-10-02' }),
    row('b', { local_date: '2026-10-20' }),
    row('c', { local_date: '2026-10-21' }),
  ];
  it('omits empty weeks and orders newest first', () => {
    const g = groupByWeek(rs, '2026-10', 1, 'newest');
    expect(g.map((x) => x.key)).toEqual(['week-4', 'week-1']);
    expect(g[0]).toMatchObject({ kind: 'week', week: 4, range: { from: 19, to: 25 }, count: 2 });
  });
  it('oldest first for oldest', () => {
    expect(groupByWeek(rs, '2026-10', 1, 'oldest').map((x) => x.key)).toEqual(['week-1', 'week-4']);
  });
});

describe('groupInOut', () => {
  it('In then Out; refunds in Out; transfers in neither; empty omitted', () => {
    const g = groupInOut(
      [
        row('a', { original_amount: 1000, amountHome: 1000 }),
        row('b', { original_amount: -300, amountHome: -300 }),
        row('r', { original_amount: 200, amountHome: 200, is_refund: true }),
        row('t', { transfer_id: 'x' }),
      ],
      'newest'
    );
    expect(g.map((x) => x.key)).toEqual(['in', 'out']);
    expect(g[1]?.rows.map((r) => r.id).sort()).toEqual(['b', 'r']);
    expect(g[1]?.net).toBe(-100);
    expect(groupInOut([row('t', { transfer_id: 'x' })], 'newest')).toEqual([]);
    expect(groupInOut([row('b')], 'newest').map((x) => x.key)).toEqual(['out']);
    expect(groupInOut([row('a', { original_amount: 5, amountHome: 5 })], 'newest').map((x) => x.key)).toEqual(['in']);
  });
});

const rowArb = fc
  .record({
    id: fc.uuid(),
    day: fc.integer({ min: 1, max: 31 }),
    amountHome: fc.option(fc.integer({ min: -100000, max: 100000 }), { nil: null }),
    status: fc.constantFrom('paid', 'pending', 'skipped'),
    transfer: fc.boolean(),
    refund: fc.boolean(),
  })
  .map(
    (r): GroupRow => ({
      id: r.id,
      local_date: `2026-10-${String(r.day).padStart(2, '0')}`,
      created_at: '2026-10-01T00:00:00Z',
      name: null,
      original_amount: r.amountHome ?? -1,
      amountHome: r.amountHome,
      status: r.status as GroupRow['status'],
      transfer_id: r.transfer ? 't' : null,
      is_refund: r.refund,
    })
  );

describe('group properties', () => {
  it('partitions rows and group nets add up to the total', () => {
    fc.assert(
      fc.property(
        fc.array(rowArb, { maxLength: 40 }),
        fc.constantFrom(...SORT_KEYS),
        fc.constantFrom(0, 1 as const),
        (rows, sort, ws) => {
          const total = netOf(rows);
          const groupings = [
            groupByDay(rows, sort),
            groupByWeek(rows, '2026-10', ws as 0 | 1, sort),
          ];
          for (const groups of groupings) {
            expect(groups.reduce((s, g) => s + g.net, 0)).toBe(total.net);
            expect(groups.reduce((s, g) => s + g.count, 0)).toBe(total.count);
            expect(groups.reduce((s, g) => s + g.unconvertedCount, 0)).toBe(total.unconvertedCount);
            expect(groups.flatMap((g) => g.rows.map((r) => r.id)).sort()).toEqual(
              rows.map((r) => r.id).sort()
            );
          }
          const io = groupInOut(rows, sort);
          const nonTransfer = rows.filter((r) => r.transfer_id === null);
          expect(io.flatMap((g) => g.rows).length).toBe(nonTransfer.length);
          expect(io.reduce((s, g) => s + g.net, 0)).toBe(total.net);
        }
      )
    );
  });
});
