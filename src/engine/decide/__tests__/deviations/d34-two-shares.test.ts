/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * The 2026-09-27 plan applied one resolveShare(scope) to the purchase and to existing household spending. D-34: two shares.
 * The purchase split is per check; existing spending, bills and the cushion use the household rule (and per-category rules).
 */
import { assess, prepareContext } from '../../assess';
import type { AssessContext, DecideSnapshot, SplitRule } from '../../types';
import { bill, buyCash, fullMonth, line, snapshotOf } from '../helpers/fixtures';

const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});

function ctx(snap: DecideSnapshot): AssessContext {
  const r = prepareContext(snap);
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}

const hh = (purchase: SplitRule, over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({
    scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: purchase },
    householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    ...over,
  });

describe('D-34 two shares', () => {
  it('D-34: overriding the purchase to mine does not change my share of existing household spending', () => {
    const even = ctx(hh({ kind: 'even' }, { bills: [YEARLY_DUE] }));
    const mine = ctx(hh({ kind: 'mine' }, { bills: [YEARLY_DUE] }));
    expect(mine.mySpendingBasis).toBe(even.mySpendingBasis);
    expect(mine.monthCosts).toBe(even.monthCosts);
    expect(mine.limits.reserve).toBe(even.limits.reserve);
    expect(mine.billsDue).toBe(even.billsDue);
    expect(even.billsDue).toBe(60_000);
    const vEven = assess(hh({ kind: 'even' }), buyCash(100_000));
    const vMine = assess(hh({ kind: 'mine' }), buyCash(100_000));
    if (vEven.state === 'missing' || vMine.state === 'missing') throw new Error('unexpected missing');
    expect(vEven.mineDayOne).toBe(50_000);
    expect(vMine.mineDayOne).toBe(100_000);
  });

  it('D-34: per-category shares apply to existing spending and bills, never to the purchase', () => {
    const rent = (month: string) =>
      line({ id: `${month}-rent`, date: `${month}-01`, direction: 'out', amount: 200_000, categoryId: 'rent' });
    const months = ['2026-04', '2026-05', '2026-06'].map((mo) => fullMonth(mo, 600_000, 100_000, [rent(mo)]));
    const rentBill = bill({
      seriesId: 's-rent-ins',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      lastPaidDate: '2025-09-01',
      latestAmount: 120_000,
      categoryId: 'rent',
    });
    const snap = hh(
      { kind: 'mine' },
      {
        months,
        householdSpending: { rule: { kind: 'mine' }, byCategory: [{ categoryId: 'rent', rule: { kind: 'even' } }] },
      }
    );
    // 100_000 uncategorised kept whole (household rule mine) + rent 200_000 halved.
    expect(ctx(snap).mySpendingBasis).toBe(200_000);
    expect(ctx({ ...snap, bills: [rentBill] }).billsDue).toBe(60_000);
    const v = assess(snap, buyCash(100_000));
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.mineDayOne).toBe(100_000);
  });
});
