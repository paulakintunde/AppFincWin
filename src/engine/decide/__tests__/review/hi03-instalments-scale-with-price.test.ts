/**
 * 04-REVIEW HI-03 regression: when the price changes (withPrice, bisection, the alternatives' cheaper row) an
 * instalment plan scales its amount with the price, rounded up, keeping the count (user decision). Reproduced before
 * the fix with 12 x 3,500.00 on 42,000.00 and 3,000.00 a month spare: affordablePrice returned nothing_affordable, and
 * the 65% cheaper row kept the 3,500.00 instalments and was suppressed as month_short 500.00 with dayDiff and
 * monthlyDiff 0. When only the owe line failed, bisection found a price whose plan total sat below that price.
 */
import { minorUnits } from '../../../money/types';
import { buildAlternatives } from '../../alternatives';
import { assessPlan, prepareContext } from '../../assess';
import { affordablePrice } from '../../bisect';
import { buildOptions } from '../../options';
import { resolvePlanStrict, withPrice } from '../../plan';
import type { AssessContext, BuyCheck, DecideSnapshot } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}

function instalments(price: number, amount: number, count: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'instalment', instalmentAmount: m(amount), instalmentCount: count },
  };
}

function amountOf(check: BuyCheck): number {
  if (check.payment.method !== 'instalment') throw new Error('expected instalment');
  return check.payment.instalmentAmount!;
}

const fits = (context: AssessContext, check: BuyCheck, p: number): boolean => {
  const c = withPrice(check, m(p)) as BuyCheck;
  return assessPlan(context, c, resolvePlanStrict(c)).state === 'fits';
};

describe('04-REVIEW HI-03: instalment plans scale with the price', () => {
  it('withPrice scales the amount proportionally, rounded up, keeping the count', () => {
    const check = instalments(180_000, 15_000, 12);
    const cheaper = withPrice(check, m(120_000)) as BuyCheck;
    expect(cheaper.price).toBe(120_000);
    expect(amountOf(cheaper)).toBe(10_000);
    expect(cheaper.payment).toMatchObject({ method: 'instalment', instalmentCount: 12 });
    // rounded up: 15,000 x 100,001 / 180,000 = 8,333.4 -> 8,334, and the scaled instalments still cover the price
    const odd = withPrice(check, m(100_001)) as BuyCheck;
    expect(amountOf(odd)).toBe(8_334);
    expect(amountOf(odd) * 12).toBeGreaterThanOrEqual(100_001);
    // a check priced at 0 has nothing to scale against
    expect(amountOf(withPrice(instalments(0, 500, 4), m(0)) as BuyCheck)).toBe(500);
    // other methods are untouched apart from the price
    const loan: BuyCheck = { ...check, payment: { method: 'loan', deposit: m(0), termMonths: 12, apr: null } };
    expect((withPrice(loan, m(1)) as BuyCheck).payment).toBe(loan.payment);
  });

  it('a failing instalment check now has an affordable price, found exactly', () => {
    const context = ctxOf(snapshotOf());
    const check = instalments(4_200_000, 350_000, 12);
    expect(assessPlan(context, check, resolvePlanStrict(check)).state).not.toBe('fits');
    const found = affordablePrice(context, check);
    expect(found.kind).toBe('found');
    if (found.kind !== 'found') return;
    expect(found.price).toBeGreaterThan(0);
    expect(fits(context, check, found.price)).toBe(true);
    expect(fits(context, check, found.price + 1)).toBe(false);
    const at = withPrice(check, found.price) as BuyCheck;
    expect(resolvePlanStrict(at).monthly).toBe(Math.ceil((350_000 * found.price) / 4_200_000));
    // the option list now carries it
    const assessment = assessPlan(context, check, resolvePlanStrict(check));
    expect(buildOptions(context, check, assessment).some((o) => o.code === 'affordable_price')).toBe(true);
  });

  it('the cheaper row scales the instalments, so it is no longer falsely month_short', () => {
    const context = ctxOf(snapshotOf());
    const check = instalments(4_200_000, 350_000, 12);
    const assessment = assessPlan(context, check, resolvePlanStrict(check));
    const alts = buildAlternatives(context, check, assessment);
    const cheaper = alts.rows.find((r) => r.code === 'cheaper')!;
    expect(alts.cheaper.monthlyPayment).toBe(227_500);
    expect(alts.cheaper.monthlyDiff).toBe(122_500);
    expect(alts.cheaper.dayDiff).toBe(122_500);
    expect(alts.cheaper.leftAfter).toBe(72_500);
    expect(cheaper.suppression?.code).not.toBe('month_short');
  });

  it('when only the owe line fails, the found price has instalments that cover it', () => {
    const context = ctxOf(
      snapshotOf({
        limits: {
          reserve: null,
          dsrLine: null,
          housingLine: null,
          unsecuredIncomeMultiple: 1,
          investingFloor: null,
          savingFloor: null,
          spareFloor: null,
        },
      })
    );
    const check = instalments(1_200_000, 50_000, 24);
    const verdict = assessPlan(context, check, resolvePlanStrict(check));
    expect(verdict.warnings.map((w) => w.code)).toEqual(['owe']);
    const found = affordablePrice(context, check);
    expect(found).toEqual({ kind: 'found', price: 600_000 });
    const plan = resolvePlanStrict(withPrice(check, m(600_000)));
    expect(plan.monthly).toBe(25_000);
    expect(plan.total).toBeGreaterThanOrEqual(plan.price);
  });
});
