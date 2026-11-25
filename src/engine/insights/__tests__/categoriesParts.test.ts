/** 10.1-09 (D-04): a split line counts each part under its own category. */
import { monthOf, v3Line } from '../../decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '../../money/types';
import { categoryTotals, spendByCategory } from '../categories';

const mu = minorUnits;
describe('10.1-09 insights read parts', () => {
  it('splits a line across categories and counts the unplaced gap as Uncategorised', () => {
    const m = monthOf('2026-10', [
      v3Line({ id: 'a', date: '2026-10-05', amount: 5000, role: 'spending', categoryId: 'g', parts: [{ categoryId: 'g', amount: mu(3000) }, { categoryId: 'd', amount: mu(2000) }] }),
      v3Line({ id: 'b', date: '2026-10-06', amount: 1000, role: 'spending', categoryId: 'g' }),
      v3Line({ id: 'c', date: '2026-10-07', amount: 700, role: 'spending', categoryId: 'g', parts: [{ categoryId: 'd', amount: mu(400) }, { categoryId: 'g', amount: mu(100) }] }),
    ]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.total).toBe(6700);
    expect(Object.fromEntries(r.rows.map((x) => [String(x.categoryId), x.amount]))).toEqual({ g: 4100, d: 2400, null: 200 });
    expect(r.rows.reduce((s, x) => s + x.amount, 0) + (r.rest?.amount ?? 0)).toBe(6700);
  });
  it('a refund of a split purchase subtracts per part', () => {
    const m = monthOf('2026-10', [
      v3Line({ id: 'a', date: '2026-10-05', amount: 5000, role: 'spending', categoryId: 'g', parts: [{ categoryId: 'g', amount: mu(3000) }, { categoryId: 'd', amount: mu(2000) }] }),
      v3Line({ id: 'r', date: '2026-10-06', amount: 1000, role: 'refund', categoryId: 'g', parts: [{ categoryId: 'g', amount: mu(600) }, { categoryId: 'd', amount: mu(400) }] }),
    ]);
    expect([...spendByCategory([m], ['2026-10'])]).toEqual([['g', 2400n], ['d', 1600n]]);
  });
});
