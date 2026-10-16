/**
 * 04-REVIEW ME-03 regression: an amortised schedule that clears before its term must report the months actually paid
 * and the last real payment. Before the fix, 100,000.00 at 22.9% over 600 months cleared in month 592 yet reported
 * months 600 and finalMonthly 0; under D-64, 1,000.00 at 22.9% over 600 months clears in month 421.
 */
import { minorUnits } from '../../../money/types';
import { amortise, percent } from '../../../payoff';
import { assessPlan, prepareContext } from '../../assess';
import { investmentViews } from '../../investmentViews';
import { buildOptions } from '../../options';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck, CardRecord } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function loan(price: number, termMonths: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'loan', deposit: m(0), termMonths, apr: percent('22.9') },
  };
}

describe('04-REVIEW ME-03: early clearance reports the real months and final payment', () => {
  it('amortise: 1,000.00 at 22.9% over 600 months clears in month 421', () => {
    const r = amortise(m(100_000), percent('22.9'), 600);
    expect(r).toMatchObject({ months: 421, termMonths: 600 });
    expect(r.finalPayment).toBeGreaterThan(0);
    expect(r.finalPayment).toBeLessThanOrEqual(r.payment);
    expect(420 * r.payment + r.finalPayment).toBe(r.totalPaid);
  });

  it('a loan plan reports the months paid and the last real payment', () => {
    const p = resolvePlanStrict(loan(10_000_000, 600));
    expect(p.months).toBe(592);
    expect(p.finalMonthly).toBeGreaterThan(0);
    const last = p.paymentSteps[p.paymentSteps.length - 1]!;
    expect(last.toMonth).toBe(592);
    expect(last.amount).toBe(p.finalMonthly);
  });

  it('a card months plan reports the months paid as its payoff months', () => {
    const card: CardRecord = { id: 'c', apr: percent('22.9'), minimumTerms: null, currency: USD };
    const check: BuyCheck = {
      ...loan(100_000, 600),
      payment: { method: 'card', card, payoff: { kind: 'months', months: 600 }, dealerCap: null },
    };
    const p = resolvePlanStrict(check);
    expect(p.months).toBe(421);
    expect(p.card!.payoffMonths).toBe(421);
    expect(p.finalMonthly).toBeGreaterThan(0);
  });

  it('options and views read the term where they need it and the paid months as the horizon', () => {
    const r = prepareContext(snapshotOf());
    if (!r.ok) throw new Error('expected ok');
    const check = loan(10_000_000, 576);
    const plan = resolvePlanStrict(check);
    expect(plan.months).toBeLessThan(576);
    const a = assessPlan(r.context, check, plan);
    const options = buildOptions(r.context, check, a);
    const longer = options.find((o) => o.code === 'longer_term');
    // the longer term steps from the 576 entered, not from the months actually paid
    expect(longer?.code === 'longer_term' && longer.termMonths).toBe(600);
    const doWithout = options.find((o) => o.code === 'do_without');
    expect(doWithout?.code === 'do_without' && doWithout.horizonMonths).toBe(plan.months);
    const views = investmentViews(r.context, check, a, { horizonMonths: null, holdingFee: null });
    expect(views.horizonMonths).toBe(plan.months);
    // the net-worth paths run over the months actually paid
    const withPath = views.netWorth[0]!.withPurchase;
    const withoutPath = views.netWorth[0]!.withoutPurchase;
    expect(withPath).toHaveLength(plan.months + 1);
    expect(withoutPath).toHaveLength(plan.months + 1);
  });
});
