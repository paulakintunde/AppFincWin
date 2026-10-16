/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { minorUnits } from '../../../money/types';
import { prepareContext } from '../../assess';
import type { AssessContext, DecideSnapshot } from '../../types';
import { USD, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function ctx(over: Partial<DecideSnapshot>): AssessContext {
  const r = prepareContext(snapshotOf(over));
  if (!r.ok) throw new Error('expected a resolved context');
  return r.context;
}

const noLimits = {
  reserve: null,
  dsrLine: null,
  unsecuredIncomeMultiple: null,
  investingFloor: null,
  savingFloor: null,
  spareFloor: null,
};
const debt = { id: 'd1', balance: m(5_000_000), minimumPayment: m(110_000), secured: false, apr: null, currency: USD };

describe('D-02 month costs', () => {
  it('D-01/D-02: the default cushion is 3 months of my own costs (average spending + debt minimums), not a fixed 6000', () => {
    // Prototype: `dlim.reserve = 6000` (a fixed dollar figure whatever the user's costs are).
    const c = ctx({ months: monthsOf([[600_000, 300_000], [600_000, 300_000], [600_000, 300_000]]), debts: [debt], limits: noLimits });
    expect(c.monthCosts).toBe(410_000);
    expect(c.limits.reserve).toBe(1_230_000);
  });

  it("D-02: saving and investing are excluded from a month's costs", () => {
    const base = ctx({ debts: [debt], limits: noLimits });
    const more = ctx({ debts: [debt], limits: noLimits, monthlySaving: m(70_000), monthlyInvesting: m(90_000) });
    expect(more.monthCosts).toBe(base.monthCosts);
    expect(more.limits.reserve).toBe(base.limits.reserve);
  });

  it('D-03 (as amended by D-34): household scope uses my share of household costs', () => {
    const c = ctx({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
      limits: noLimits,
    });
    expect(c.monthCosts).toBe(150_000);
    expect(c.limits.reserve).toBe(450_000);
  });
});
