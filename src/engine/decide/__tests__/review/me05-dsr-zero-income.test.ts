/**
 * 04-REVIEW ME-05 regression: the DSR line must not be skipped when the income basis is 0. Under the cautious worst
 * basis one zero-income month makes incomeBasis 0; a new loan then never breached DSR, checks.dsr read true, and when
 * saving and investing covered the month gap the state was `adjust` with only `inv`.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { assessPlan, prepareContext } from '../../assess';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck } from '../../types';
import { USD, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

const LOAN: BuyCheck = {
  kind: 'buy',
  currency: USD,
  price: m(600_000),
  dayFees: m(0),
  itemType: 'general',
  runningCostsNet: m(0),
  payment: { method: 'loan', deposit: m(0), termMonths: 24, apr: percent('9.9') },
};

describe('04-REVIEW ME-05: the dsr line applies with an income basis of 0', () => {
  it('a new loan against a zero worst-month income breaches dsr by its whole payment', () => {
    // one zero-income month under the worst basis; saving and investing cover the month gap
    const s = snapshotOf({
      months: monthsOf([[600_000, 100_000], [0, 100_000], [600_000, 100_000]], '2026-04'),
      basisOverride: 'worst',
      monthlySaving: m(200_000),
      monthlyInvesting: m(200_000),
    });
    const r = prepareContext(s);
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.money.incomeBasis).toBe(0);
    const a = assessPlan(r.context, LOAN, resolvePlanStrict(LOAN));
    expect(a.checks.dsr).toBe(false);
    const dsr = a.warnings.find((w) => w.code === 'dsr');
    expect(dsr?.shortfall).toBe(a.debtServiceAfter);
    expect(a.debtServiceRatioAfter).toBeNull();
    expect(a.warnings.map((w) => w.code)).toContain('inv');
  });

  it('no debt service at all still passes', () => {
    const s = snapshotOf({ months: monthsOf([[0, 100_000], [0, 100_000], [0, 100_000]], '2026-04') });
    const r = prepareContext(s);
    if (!r.ok) throw new Error('expected ok');
    const cash: BuyCheck = { ...LOAN, payment: { method: 'cash' } };
    const a = assessPlan(r.context, cash, resolvePlanStrict(cash));
    expect(a.checks.dsr).toBe(true);
    expect(a.warnings.map((w) => w.code)).not.toContain('dsr');
  });
});
