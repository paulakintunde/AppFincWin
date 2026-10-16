/**
 * 04-REVIEW ME-02 regression: an instalment plan pays the on-the-day fees inside the price on day one, as the loan path
 * does. Reproduced before the fix: a 4,300.00 price with 300.00 of on-the-day fees and 4 x 1,000.00 gave dayOne 1,000.00
 * and total 4,000.00, so the fees left cash nowhere and the cash check was understated by 300.00.
 */
import { minorUnits } from '../../../money/types';
import { ZERO_PERCENT, percent } from '../../../payoff';
import { assessPlan, prepareContext } from '../../assess';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function instalments(price: number, dayFees: number, amount: number, count: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(dayFees),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'instalment', instalmentAmount: m(amount), instalmentCount: count },
  };
}

describe('04-REVIEW ME-02: instalment plans pay on-the-day fees on day one', () => {
  it('the review case: the 300.00 of fees is in dayOne and the total; the instalments finance the rest', () => {
    const p = resolvePlanStrict(instalments(430_000, 30_000, 100_000, 4));
    expect(p).toMatchObject({ dayOne: 130_000, monthly: 100_000, total: 430_000, financed: 400_000, interest: 0 });
    expect(p.impliedAnnualRate).toBe(ZERO_PERCENT);
    // paymentSteps stays the series source: total - dayOne
    const steps = p.paymentSteps.reduce((t, s) => t + s.amount * (s.toMonth - s.fromMonth + 1), 0);
    expect(steps).toBe(p.total! - p.dayOne);
  });

  it('the cash check reads the fees', () => {
    const r = prepareContext(snapshotOf());
    if (!r.ok) throw new Error('expected ok');
    const check = instalments(430_000, 30_000, 100_000, 4);
    const a = assessPlan(r.context, check, resolvePlanStrict(check));
    expect(a.cashAfter).toBe(r.context.cashAvailable - 130_000);
  });

  it('the implied rate is on the financed amount, and equals the prototype figure without fees', () => {
    // 4 x 1,050.00 on 4,000.00 financed: (4,200 / 4,000 - 1) x 12 / 4 = 15%
    expect(resolvePlanStrict(instalments(430_000, 30_000, 105_000, 4)).impliedAnnualRate).toBe(percent('15'));
    expect(resolvePlanStrict(instalments(400_000, 0, 105_000, 4)).impliedAnnualRate).toBe(percent('15'));
  });

  it('fees above the price leave nothing financed', () => {
    const p = resolvePlanStrict(instalments(10_000, 20_000, 1_000, 2));
    expect(p.financed).toBe(0);
    expect(p.impliedAnnualRate).toBe(ZERO_PERCENT);
    expect(p.dayOne).toBe(21_000);
  });
});
