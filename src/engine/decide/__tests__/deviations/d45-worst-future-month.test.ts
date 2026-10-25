/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-45).
 *
 * New behaviour with no prototype counterpart: the prototype judged only the month as logged. D-45 judges the worst of
 * the next 12 months under the user's known future changes, so a later raise never rescues an earlier shortfall.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { DecideSnapshot, FutureChange, Verdict } from '../../types';
import { USD, buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function bl(futureChanges: readonly FutureChange[] = []): DecideSnapshot {
  return snapshotOf({
    debts: [
      { id: 'd1', balance: m(800_000), minimumPayment: m(20_000), secured: false, apr: percent('19.9'), currency: USD },
      { id: 'd2', balance: m(15_000_000), minimumPayment: m(90_000), secured: true, apr: percent('5.1'), currency: USD },
    ],
    monthlySaving: m(25_000),
    monthlyInvesting: m(40_000),
    limits: {
      reserve: m(600_000),
      dsrLine: percent('36'),
      housingLine: null,
      unsecuredIncomeMultiple: 12,
      investingFloor: m(40_000),
      savingFloor: m(25_000),
      spareFloor: null,
    },
    futureChanges,
  });
}

const change = (
  id: string,
  kind: 'income' | 'spending',
  amount: number,
  startMonth: string,
  endMonth: string | null = null
): FutureChange => ({ id, kind, monthlyAmount: m(amount), startMonth, endMonth, currency: USD });

function ok(v: Verdict): Exclude<Verdict, { state: 'missing' }> {
  if (v.state === 'missing') throw new Error('expected a verdict');
  return v;
}

describe('D-45: the worst of the next 12 months', () => {
  it('D-45: the month ledger uses the worst of the next 12 months', () => {
    const v = ok(assess(bl([change('c1', 'spending', 150_000, '2026-11')]), buyCash(100_000)));
    expect(v.left).toBe(-25_000);
    expect(v.state).toBe('adjust');
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
    expect(ok(assess(bl(), buyCash(100_000))).state).toBe('fits');
  });

  it('D-45: a later raise never rescues an earlier shortfall', () => {
    const v = ok(
      assess(
        bl([change('c1', 'spending', 200_000, '2026-09', '2026-09'), change('c2', 'income', 500_000, '2026-10')]),
        buyCash(100_000)
      )
    );
    expect(v.left).toBe(-75_000);
    expect(v.context.position!.worstMonth.month).toBe('2026-09');
  });

  it('D-45: changes outside the next 12 months are ignored', () => {
    const outside = bl([
      change('late', 'spending', 400_000, '2027-08'),
      change('early', 'spending', 400_000, '2026-06', '2026-07'),
    ]);
    const v = ok(assess(outside, buyCash(100_000)));
    expect(v.left).toBe(125_000);
    expect(v.state).toBe('fits');
  });
});
