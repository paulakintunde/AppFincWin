import { overCapRows } from '../overCapRows';

const row = (id: string, o: Record<string, unknown> = {}) =>
  ({
    id,
    category_id: 'groceries',
    local_date: '2026-10-05',
    created_at: `2026-10-05T0${id.length}:00:00Z`,
    status: 'paid',
    transfer_id: null,
    amountHome: -5000,
    original_amount: -5000,
    category_parts: null,
    ...o,
  }) as never;
const cats = [
  { id: 'groceries', monthly_cap: 4000 },
  { id: 'dining', monthly_cap: 1000 },
];

describe('overCapRows with parts (10.1-10, D-05)', () => {
  it('uses only the part in the capped category', () => {
    const parts = [{ c: 'groceries', a: -3000 }, { c: 'dining', a: -2000 }];
    const out = overCapRows([row('s', { category_parts: parts })], cats);
    expect(out.has('s')).toBe(true);
    expect(out.get('s')).toBe(1000); // dining 2000 vs cap 1000; groceries 3000 under 4000
  });

  it('lists a split line under each over-cap category', () => {
    const parts = [{ c: 'groceries', a: -4500 }, { c: 'dining', a: -500 }];
    const out = overCapRows([row('s', { original_amount: -5000, category_parts: parts })], cats);
    expect(out.get('s')).toBe(500); // groceries 4500 vs 4000 (dining 500 under)
  });

  it('ignores a gap and a line with no home amount', () => {
    const parts = [{ c: 'groceries', a: -3000 }, { c: 'dining', a: -500 }];
    expect(overCapRows([row('s', { category_parts: parts })], cats).size).toBe(0);
    expect(overCapRows([row('n', { amountHome: null })], cats).size).toBe(0);
  });

  it('an unsplit line behaves as before', () => {
    expect(overCapRows([row('u')], cats).get('u')).toBe(1000);
  });
});
