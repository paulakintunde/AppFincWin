/** 07-02 (INS-04, D-14, D-28, ARC-18): category totals. */
import type { LineRole } from '../../decide/v3/types';
import { monthOf, v3Line } from '../../decide/v3/__tests__/helpers/fixtures';
import { categoryTotals } from '../categories';

let n = 0;
const line = (role: LineRole, amount: number, categoryId: string | null, over: { status?: 'paid' | 'pending'; date?: string } = {}) =>
  v3Line({ id: `l${(n += 1)}`, date: over.date ?? '2026-10-05', amount, role, categoryId, ...(over.status ? { status: over.status } : {}) });

describe('07-02 categoryTotals', () => {
  it('counts only paid spending less refunds, per category', () => {
    const m = monthOf('2026-10', [
      line('spending', -5_000, 'food'),
      line('spending', 3_000, 'food'),
      line('refund', 1_000, 'food'),
      line('spending', 2_000, 'fun', { status: 'pending' }),
      line('spending', 4_000, 'fun'),
    ]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.total).toBe(11_000);
    expect(r.rows.map((x) => [x.categoryId, x.amount])).toEqual([['food', 7_000], ['fun', 4_000]]);
    expect(r.refundsExceeded).toEqual([]);
    expect(r.leftOut).toBe(false);
  });

  it('other roles add nothing', () => {
    const roles: LineRole[] = ['income', 'other_in', 'debt_payment', 'saved_invested', 'other_out', 'own_transfer', 'envelope_deposit', 'envelope_withdrawal', 'emergency_move'];
    const m = monthOf('2026-10', [...roles.map((r) => line(r, 900, 'x')), line('spending', 100, 'food')]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.total).toBe(100);
    expect(r.rows.map((x) => x.categoryId)).toEqual(['food']);
    expect(r.leftOut).toBe(true);
  });

  it('a pending move does not set leftOut', () => {
    const m = monthOf('2026-10', [line('own_transfer', 900, null, { status: 'pending' }), line('spending', 100, 'a')]);
    expect(categoryTotals([m], ['2026-10']).leftOut).toBe(false);
  });

  it('a category whose refunds exceed spending counts 0 and is named', () => {
    const m = monthOf('2026-10', [line('spending', 1_000, 'a'), line('refund', 3_000, 'a'), line('refund', 500, null), line('spending', 2_000, 'b')]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.total).toBe(2_000);
    expect(r.rows.map((x) => x.categoryId)).toEqual(['b']);
    expect(r.refundsExceeded).toEqual(['a', null]);
  });

  it('groups a null category and sorts by amount, then id, null last', () => {
    const m = monthOf('2026-10', [line('spending', 100, null), line('spending', 100, 'b'), line('spending', 100, 'a'), line('spending', 500, 'z')]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.rows.map((x) => x.categoryId)).toEqual(['z', 'a', 'b', null]);
  });

  it('sorts a null ahead of an id as last in both orders', () => {
    const m = monthOf('2026-10', [line('spending', 100, 'a'), line('spending', 100, null)]);
    expect(categoryTotals([m], ['2026-10']).rows.map((x) => x.categoryId)).toEqual(['a', null]);
  });

  it('shares are basis points rounded half up; under 1% folds into the rest', () => {
    const m = monthOf('2026-10', [line('spending', 9_900, 'a'), line('spending', 60, 'b'), line('spending', 40, 'c')]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.total).toBe(10_000);
    expect(r.rows).toEqual([{ categoryId: 'a', amount: 9_900, shareBp: 9_900 }]);
    expect(r.rest).toEqual({ amount: 100, shareBp: 100, count: 2 });
  });

  it('a category at exactly 1% stays a row; rest is null when nothing folds', () => {
    const m = monthOf('2026-10', [line('spending', 9_900, 'a'), line('spending', 100, 'b')]);
    const r = categoryTotals([m], ['2026-10']);
    expect(r.rows.map((x) => x.shareBp)).toEqual([9_900, 100]);
    expect(r.rest).toBeNull();
  });

  it('with no spending the list is empty', () => {
    const r = categoryTotals([monthOf('2026-10', [line('income', 100, null)])], ['2026-10']);
    expect(r).toEqual({ total: 0, rows: [], rest: null, refundsExceeded: [], leftOut: false });
  });

  it('adds several months and ignores months outside the period', () => {
    const a = monthOf('2026-09', [line('spending', 100, 'a')]);
    const b = monthOf('2026-10', [line('spending', 200, 'a')]);
    const c = monthOf('2026-08', [line('spending', 999, 'a')]);
    expect(categoryTotals([a, b, c], ['2026-09', '2026-10']).total).toBe(300);
  });
});
