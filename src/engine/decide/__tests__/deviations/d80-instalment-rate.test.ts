/**
 * D-80 (05-CONTEXT, UI-SPEC R15.7 E1): an instalment plan may carry an annual rate and a first-payment date. With a rate
 * the payment is worked out on the amount financed (an annuity-due for 'today', an ordinary annuity for 'next_month');
 * a typed amount is still the one scored; the new reason is instalment_rate_missing. Without a rate and with 'today',
 * every figure is the Phase 4 figure.
 */
import { minorUnits } from '../../../money/types';
import { amortise, amortiseDue, percent } from '../../../payoff';
import { MAX_APR_PERCENT } from '../../constants';
import { resolvePlan, withPrice } from '../../plan';
import type { BuyCheck, BuyPayment, Plan, PurchaseCheck } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;
type Instalment = Extract<BuyPayment, { method: 'instalment' }>;

function check(price: number, payment: Omit<Instalment, 'method'>, dayFees = 0): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(dayFees),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'instalment', ...payment },
  };
}

function resolved(c: PurchaseCheck): Plan {
  const r = resolvePlan(c);
  if (r.status !== 'resolved') throw new Error(`expected resolved, got ${r.reasons.join(',')}`);
  return r.plan;
}

const stepSum = (p: Plan): number => p.paymentSteps.reduce((s, x) => s + x.amount * (x.toMonth - x.fromMonth + 1), 0);

describe('D-80 instalment plan with a rate', () => {
  it('D-80 a rate works out the payment, first payment today', () => {
    const due = amortiseDue(m(120_000), percent('12'), 12);
    const plan = resolved(check(120_000, { instalmentAmount: null, instalmentCount: 12, apr: percent('12') }));
    expect(plan.computedPayment).toBe(due.payment);
    expect(plan.computedPayment).toBe(10_557);
    expect(plan.monthly).toBe(due.payment);
    expect(plan.dayOne).toBe(due.payment);
    expect(plan.months).toBe(12);
    expect(plan.financed).toBe(120_000);
    expect(plan.total).toBe(due.totalPaid);
    expect(plan.interest).toBe(due.totalPaid - 120_000);
    expect(plan.interest).toBe(due.totalInterest);
    expect(plan.finalMonthly).toBe(due.finalPayment);
    expect(plan.impliedAnnualRate).toBeNull();
    // payments after day one are months 1..11; the last is the adjusted final payment
    expect(plan.paymentSteps[0]!.fromMonth).toBe(1);
    expect(plan.paymentSteps[plan.paymentSteps.length - 1]!.toMonth).toBe(11);
    expect(plan.dayOne + stepSum(plan)).toBe(due.totalPaid);
    expect(plan.total).toBe(plan.dayOne + stepSum(plan));
  });

  it('D-80 next_month pays only the fees on the day and runs months 1 to count', () => {
    const ord = amortise(m(120_000), percent('12'), 12);
    const plan = resolved(
      check(121_000, { instalmentAmount: null, instalmentCount: 12, apr: percent('12'), firstPayment: 'next_month' }, 1_000)
    );
    expect(plan.dayOne).toBe(1_000);
    expect(plan.computedPayment).toBe(ord.payment);
    expect(plan.monthly).toBe(ord.payment);
    expect(plan.months).toBe(12);
    expect(plan.paymentSteps[0]!.fromMonth).toBe(1);
    expect(plan.paymentSteps[plan.paymentSteps.length - 1]!.toMonth).toBe(12);
    expect(stepSum(plan)).toBe(ord.totalPaid);
    expect(plan.total).toBe(ord.totalPaid + 1_000);
    expect(plan.interest).toBe(ord.totalInterest);
  });

  it('D-80 a quoted payment is scored and computedPayment carries the worked-out one', () => {
    const plan = resolved(check(120_000, { instalmentAmount: m(11_000), instalmentCount: 12, apr: percent('12') }));
    expect(plan.monthly).toBe(11_000);
    expect(plan.finalMonthly).toBe(11_000);
    expect(plan.computedPayment).toBe(10_557);
    expect(plan.dayOne).toBe(11_000);
    expect(plan.total).toBe(132_000);
    expect(plan.interest).toBe(12_000);
    expect(plan.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 11, amount: 11_000 }]);
  });

  it('D-80 at 0% with a rate the payment is ceil(financed over count)', () => {
    const plan = resolved(check(500_000, { instalmentAmount: null, instalmentCount: 12, apr: percent('0') }));
    expect(plan.computedPayment).toBe(41_667);
    expect(plan.monthly).toBe(41_667);
    expect(plan.interest).toBe(0);
    expect(plan.total).toBe(500_000);
    expect(plan.finalMonthly).toBe(41_663);
  });

  it('D-80 below the price applies with a rate', () => {
    const r = resolvePlan(check(120_000, { instalmentAmount: m(9_000), instalmentCount: 12, apr: percent('12') }));
    expect(r).toEqual({ status: 'missing', reasons: ['instalment_total_below_price'] });
    // exactly the amount financed is fine, with interest 0
    const ok = resolved(check(120_000, { instalmentAmount: m(10_000), instalmentCount: 12, apr: percent('12') }));
    expect(ok.interest).toBe(0);
  });

  it('D-80 a missing rate is instalment_rate_missing', () => {
    expect(resolvePlan(check(120_000, { instalmentAmount: null, instalmentCount: 12, apr: null }))).toEqual({
      status: 'missing',
      reasons: ['instalment_rate_missing'],
    });
    // a missing amount is not a reason with a rate; the count and the rate are
    expect(resolvePlan(check(120_000, { instalmentAmount: null, instalmentCount: null, apr: null }))).toEqual({
      status: 'missing',
      reasons: ['instalment_count_missing', 'instalment_rate_missing'],
    });
    // without a rate the old reasons stand
    expect(resolvePlan(check(120_000, { instalmentAmount: null, instalmentCount: null }))).toEqual({
      status: 'missing',
      reasons: ['instalment_amount_missing', 'instalment_count_missing'],
    });
  });

  it('D-80 an apr above the maximum is a RangeError', () => {
    expect(() =>
      resolvePlan(check(120_000, { instalmentAmount: null, instalmentCount: 12, apr: percent('1000') }))
    ).toThrow(RangeError);
    expect(
      resolvePlan(check(120_000, { instalmentAmount: null, instalmentCount: 12, apr: MAX_APR_PERCENT })).status
    ).toBe('resolved');
  });

  it('D-80 nothing financed with a rate has no payments and only the fees on the day', () => {
    const plan = resolved(check(1_000, { instalmentAmount: null, instalmentCount: 6, apr: percent('12') }, 1_000));
    expect(plan.months).toBe(0);
    expect(plan.monthly).toBe(0);
    expect(plan.dayOne).toBe(1_000);
    expect(plan.paymentSteps).toEqual([]);
    expect(plan.interest).toBe(0);
    expect(plan.total).toBe(1_000);
  });

  it('D-80 a re-priced check recomputes the payment on the new price; a typed amount still scales', () => {
    const worked = check(120_000, { instalmentAmount: null, instalmentCount: 12, apr: percent('12') });
    const cheaper = withPrice(worked, m(60_000));
    expect(resolved(cheaper).computedPayment).toBe(amortiseDue(m(60_000), percent('12'), 12).payment);
    const typed = check(120_000, { instalmentAmount: m(11_000), instalmentCount: 12, apr: percent('12') });
    const half = withPrice(typed, m(60_000));
    expect(half.kind === 'buy' && half.payment.method === 'instalment' && half.payment.instalmentAmount).toBe(5_500);
  });
});

describe('D-80 instalment plan without a rate', () => {
  it('D-80 without a rate and today nothing changes', () => {
    const plain = resolved(check(120_000, { instalmentAmount: m(10_000), instalmentCount: 12 }, 0));
    const explicit = resolved(check(120_000, { instalmentAmount: m(10_000), instalmentCount: 12, firstPayment: 'today' }, 0));
    expect(explicit).toEqual(plain);
    expect(plain.dayOne).toBe(10_000);
    expect(plain.monthly).toBe(10_000);
    expect(plain.months).toBe(12);
    expect(plain.total).toBe(120_000);
    expect(plain.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 11, amount: 10_000 }]);
    expect(plain.computedPayment).toBeUndefined();
    expect('computedPayment' in plain).toBe(false);
    expect(plain.impliedAnnualRate).toBe(0n);
  });

  it('D-80 without a rate next_month pays the fees on the day and months 1 to count', () => {
    const plan = resolved(
      check(125_000, { instalmentAmount: m(10_000), instalmentCount: 12, firstPayment: 'next_month' }, 5_000)
    );
    expect(plan.dayOne).toBe(5_000);
    expect(plan.monthly).toBe(10_000);
    expect(plan.total).toBe(125_000);
    expect(plan.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 12, amount: 10_000 }]);
  });

  it('D-80 without a rate, fees above the price leave nothing financed and interest stays non-negative', () => {
    const plan = resolved(check(1_000, { instalmentAmount: m(0), instalmentCount: 3 }, 2_000));
    expect(plan.financed).toBe(0);
    expect(plan.interest).toBe(1_000);
    expect(plan.impliedAnnualRate).toBe(0n);
  });
});
