/**
 * 04-REVIEW HI-04 regression (D-64): the month test, the cash path and the longer_term option read the level payment,
 * so the level payment must never sit below a later scheduled payment. Before D-64, 5,000.00 at 29.9% over 360 months
 * had a level payment of 124.60 and a final payment of 402.46, and the month test never saw the final month.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { assessPlan, prepareContext } from '../../assess';
import { buildOptions } from '../../options';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck, Plan } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function loan(price: number, apr: string, termMonths: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'loan', deposit: m(0), termMonths, apr: percent(apr) },
  };
}

const highestStep = (p: Plan): number => Math.max(...p.paymentSteps.map((s) => s.amount));

describe('04-REVIEW HI-04: no scheduled payment exceeds the monthly figure the month test uses', () => {
  it.each([
    [500_000, '29.9', 360],
    [100_000, '22.9', 360],
    [100_000, '22.9', 600],
    [10_000_000, '29.9', 600],
    [3_200_000, '6', 36],
  ])('%i at %s%% over %i months', (price, apr, term) => {
    const p = resolvePlanStrict(loan(price, apr, term));
    expect(p.finalMonthly).toBeLessThanOrEqual(p.monthly);
    expect(highestStep(p)).toBe(p.monthly);
  });

  it('the longer_term option reports a monthly payment no later month exceeds', () => {
    const r = prepareContext(snapshotOf());
    if (!r.ok) throw new Error('expected ok');
    const check = loan(10_000_000, '29.9', 336);
    const a = assessPlan(r.context, check, resolvePlanStrict(check));
    expect(a.state).not.toBe('fits');
    const longer = buildOptions(r.context, check, a).find((o) => o.code === 'longer_term');
    expect(longer).toBeDefined();
    if (longer?.code !== 'longer_term') return;
    const longerPlan = resolvePlanStrict(loan(10_000_000, '29.9', longer.termMonths));
    expect(longer.monthlyPayment).toBe(longerPlan.monthly);
    expect(highestStep(longerPlan)).toBe(longerPlan.monthly);
  });
});
