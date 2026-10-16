/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * Prototype dassess: `investAtRisk = min(invMo, -left)`; `if (left < 0) w.push({ k: 'month', short: -left })`;
 * `if (investAfter < minInv) w.push({ k: 'inv', ... })`; state `no` whenever left < 0. D-35: saving and investing are
 * pausable (investing first). A shortfall inside the pausable amount is `adjust` with `inv` carrying the pause; beyond
 * it the state is `no` and `month` carries what remains after pausing everything.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { BuyCheck, DecideSnapshot, Verdict } from '../../types';
import { USD, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function r(floors: { inv: number; sav: number } = { inv: 40_000, sav: 25_000 }): DecideSnapshot {
  return snapshotOf({
    months: monthsOf([[1_000_000, 700_000], [1_000_000, 700_000], [1_000_000, 700_000]], '2026-04'),
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
      investingFloor: m(floors.inv),
      savingFloor: m(floors.sav),
      spareFloor: null,
    },
  });
}

const inst = (a: number): BuyCheck => ({
  kind: 'buy',
  currency: USD,
  price: m(12 * a),
  dayFees: m(0),
  itemType: 'general',
  runningCostsNet: m(0),
  payment: { method: 'instalment', instalmentAmount: m(a), instalmentCount: 12 },
});

function full(v: Verdict) {
  if (v.state === 'missing') throw new Error('unexpected missing');
  return v;
}

describe('D-35 pausable saving and investing', () => {
  it('D-35: a shortfall that pausing covers is adjust with inv carrying the pause, not no', () => {
    // Prototype returned 'no' with [month 25_000, inv 25_000].
    const v = full(assess(r(), inst(150_000)));
    expect(v.state).toBe('adjust');
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
  });

  it('D-35: the pause comes from investing first, then saving', () => {
    const v = full(assess(r(), inst(180_000)));
    expect(v.investingAtRisk).toBe(40_000);
    expect(v.savingAtRisk).toBe(15_000);
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 55_000 }]);
  });

  it('D-35: beyond pausable the verdict is no and month carries what remains after pausing everything', () => {
    const v = full(assess(r(), inst(200_000)));
    expect(v.state).toBe('no');
    expect(v.warnings).toEqual([
      { code: 'inv', shortfall: 65_000 },
      { code: 'month', shortfall: 10_000 },
    ]);
  });

  it('D-35: a pause that stays above the floors is still reported', () => {
    const v = full(assess(r({ inv: 0, sav: 0 }), inst(150_000)));
    expect(v.state).toBe('adjust');
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
  });
});
