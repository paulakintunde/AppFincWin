/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-53).
 *
 * New behaviour with no prototype counterpart: income the purchase itself costs the user (a lower-paid job, a drop in
 * hours) is a D-45 change inside the verdict; income it might bring in never props the verdict up. A gain is only ever
 * reported beside the verdict, in its own "with expected income" assessment.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { DecideSnapshot } from '../../types';
import { USD, buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function bl(): DecideSnapshot {
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
      unsecuredIncomeMultiple: 12,
      investingFloor: m(40_000),
      savingFloor: m(25_000),
      spareFloor: null,
    },
  });
}

const change = (monthlyAmount: number) => ({
  monthlyAmount: m(monthlyAmount),
  startDate: '2026-08-15',
  likelihood: 'likely' as const,
});

describe('D-53: purchase-linked income', () => {
  it('D-53: an expected income loss from the purchase is in the verdict as a D-45 change', () => {
    const v = assess(bl(), buyCash(100_000, { incomeChange: change(-150_000) }));
    if (v.state === 'missing') throw new Error('expected a verdict');
    expect(v.left).toBe(-25_000);
    expect(v.state).toBe('adjust');
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
  });

  it('D-53: an expected income gain never enters the main verdict', () => {
    const withGain = assess(bl(), buyCash(100_000, { incomeChange: change(400_000) }));
    expect(withGain).toEqual(assess(bl(), buyCash(100_000)));
  });
});
