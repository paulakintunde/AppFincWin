import fc from 'fast-check';
import { sortRows, SORT_KEYS, type SortRow } from '../sort';

const row = (id: string, o: Partial<SortRow> = {}): SortRow => ({
  id,
  local_date: '2026-10-01',
  created_at: '2026-10-01T00:00:00Z',
  name: null,
  original_amount: -100,
  amountHome: null,
  ...o,
});

describe('sortRows', () => {
  it('newest and oldest orders', () => {
    const rs = [
      row('a', { local_date: '2026-10-02' }),
      row('b', { local_date: '2026-10-03' }),
      row('c', { local_date: '2026-10-03', created_at: '2026-10-02T00:00:00Z' }),
    ];
    expect(sortRows(rs, 'newest').map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rs, 'oldest').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties on id', () => {
    expect(sortRows([row('a'), row('b')], 'newest').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('biggest and smallest use absolute home value, falling back to original', () => {
    const rs = [row('a', { amountHome: -500 }), row('b', { original_amount: 900 }), row('c', { amountHome: 100 })];
    expect(sortRows(rs, 'biggest').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortRows(rs, 'smallest').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('biggest ties fall back to newest', () => {
    const rs = [row('a', { local_date: '2026-10-01' }), row('b', { local_date: '2026-10-05' })];
    expect(sortRows(rs, 'biggest').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('smallest ties fall back to newest', () => {
    const rs = [row('a', { local_date: '2026-10-01' }), row('b', { local_date: '2026-10-05' })];
    expect(sortRows(rs, 'smallest').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('az is accent and case insensitive, null names first, ties newest', () => {
    const rs = [
      row('a', { name: 'Zoo' }),
      row('b', { name: 'école' }),
      row('c', { name: null }),
      row('d', { name: 'apple', local_date: '2026-10-09' }),
      row('e', { name: 'Apple' }),
    ];
    expect(sortRows(rs, 'az').map((r) => r.id)).toEqual(['c', 'd', 'e', 'b', 'a']);
  });

  it('does not mutate input, is idempotent, and ignores input order', () => {
    const rowArb = fc.record({
      id: fc.uuid(),
      local_date: fc.constantFrom('2026-10-01', '2026-10-02', '2026-10-03'),
      created_at: fc.constantFrom('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
      name: fc.option(fc.string(), { nil: null }),
      original_amount: fc.integer({ min: -1000, max: 1000 }),
      amountHome: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(rowArb, { selector: (r) => r.id }),
        fc.constantFrom(...SORT_KEYS),
        (rs, key) => {
          const copy = [...rs];
          const once = sortRows(rs, key);
          expect(rs).toEqual(copy);
          expect(sortRows(once, key)).toEqual(once);
          expect(sortRows([...rs].reverse(), key).map((r) => r.id)).toEqual(once.map((r) => r.id));
        }
      )
    );
  });
});
