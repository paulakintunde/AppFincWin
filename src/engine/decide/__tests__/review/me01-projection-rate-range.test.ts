/**
 * 04-REVIEW ME-01 regression: a high user-entered projection rate must not throw and take down a whole result.
 * Reproduced before the fix: a 60% entered rate with a 600-month loan made buildOptions throw
 * "futureValue: result exceeds Number.MAX_SAFE_INTEGER", losing the affordable price, cut-line and save-first options.
 *
 * User decision: a rate above 100% a year is invalid input, rejected with the reason code projection_rate_out_of_range
 * (no throw). At or below the cap a figure past the safe range is reported as 'exceeds_range' with null figures.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { assess, assessPlan, prepareContext } from '../../assess';
import { buildAlternatives } from '../../alternatives';
import { MAX_PROJECTION_RATE } from '../../constants';
import { investmentViews } from '../../investmentViews';
import { buildOptions } from '../../options';
import { resolvePlanStrict } from '../../plan';
import type { AssessContext, BuyCheck, DecideSnapshot } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}

function loan(price: number, termMonths: number, deposit = 0, apr = '9.9'): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'loan', deposit: m(deposit), termMonths, apr: percent(apr) },
  };
}

describe('04-REVIEW ME-01: projection rates are range-checked and projections never throw', () => {
  it('a rate above 100% a year is invalid input with a reason code, in either field', () => {
    expect(MAX_PROJECTION_RATE).toBe(percent('100'));
    for (const over of [
      { projectionRates: [percent('100.0000000001')] },
      { projectionRates: [percent('5'), percent('150')] },
      { projectionReturn: percent('250') },
    ]) {
      const r = prepareContext(snapshotOf(over));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reasons).toEqual(['projection_rate_out_of_range']);
      const v = assess(snapshotOf(over), loan(1_000_000, 36));
      expect(v.state).toBe('missing');
      if (v.state === 'missing') expect(v.reasons).toEqual(['projection_rate_out_of_range']);
    }
    // exactly 100% is accepted
    expect(prepareContext(snapshotOf({ projectionRates: [percent('100')], projectionReturn: percent('100') })).ok).toBe(true);
  });

  it('the review case: a 60% rate over a 600-month loan no longer throws, and every other option survives', () => {
    const context = ctxOf(snapshotOf({ projectionRates: [percent('60')], projectionReturn: percent('60') }));
    const check = loan(20_000_000, 600);
    const a = assessPlan(context, check, resolvePlanStrict(check));
    expect(a.state).not.toBe('fits');
    const options = buildOptions(context, check, a);
    expect(options.some((o) => o.code === 'affordable_price')).toBe(true);
    const doWithout = options.find((o) => o.code === 'do_without');
    if (doWithout?.code !== 'do_without') throw new Error('expected do_without');
    expect(doWithout).toMatchObject({ projected: null, rangeCode: 'exceeds_range' });
    expect(doWithout.byRate[0]).toMatchObject({ rangeCode: null }); // 0% stays in range
    expect(doWithout.byRate[1]).toMatchObject({ projected: null, growth: null, rangeCode: 'exceeds_range' });
  });

  it('investment views at 100% over 600 months report out-of-range figures and points', () => {
    const context = ctxOf(snapshotOf({ projectionRates: [percent('100')], monthlyInvesting: m(10_000) }));
    const check = loan(20_000_000, 600);
    const a = assessPlan(context, check, resolvePlanStrict(check));
    const views = investmentViews(context, check, a, { horizonMonths: 600, holdingFee: null });
    expect(views.priceInvested.byRate[0]!.rangeCode).toBeNull();
    expect(views.priceInvested.byRate[1]).toMatchObject({ projected: null, growth: null, rangeCode: 'exceeds_range' });
    expect(views.paymentsInvested.byRate[1]).toMatchObject({ projected: null, rangeCode: 'exceeds_range' });
    expect(views.netWorth[0]!.rangeCode).toBeNull();
    const high = views.netWorth[1]!;
    expect(high.rangeCode).toBe('exceeds_range');
    expect(high.withoutPurchase[0]).not.toBeNull(); // month 0 is today's figure
    expect(high.withoutPurchase[600]).toBeNull();
  });

  it('a paused-investing view past the range is reported, not thrown', () => {
    const context = ctxOf(snapshotOf({ projectionRates: [percent('100')], monthlyInvesting: m(250_000) }));
    const check = loan(20_000_000, 600, 0, '5');
    const a = assessPlan(context, check, resolvePlanStrict(check));
    expect(a.investingAtRisk).toBeGreaterThan(0);
    const views = investmentViews(context, check, a, { horizonMonths: 600, holdingFee: null });
    expect(views.pauseImpact!.byRate[1]).toMatchObject({ projected: null, rangeCode: 'exceeds_range' });
  });

  it('alternatives: a row whose projection is past the range is reported, not thrown', () => {
    const context = ctxOf(
      snapshotOf({
        cashOnHand: m(3_000_000_000_000),
        projectionRates: [percent('100')],
        projectionReturn: percent('100'),
      })
    );
    // 10,000,000,000.00 down on a 120-month loan: the skip row keeps that seed for 120 months at 100%
    const check = loan(2_000_000_000_000, 120, 1_000_000_000_000, '0');
    const a = assessPlan(context, check, resolvePlanStrict(check));
    const alts = buildAlternatives(context, check, a);
    expect(alts.horizonMonths).toBe(120);
    const skip = alts.rows.find((r) => r.code === 'skip')!;
    expect(skip.suppression).toBeNull();
    expect(skip).toMatchObject({ projected: null, growth: null, rangeCode: 'exceeds_range' });
    expect(skip.byRate![0]!.rangeCode).toBeNull();
    expect(skip.byRate![1]).toMatchObject({ projected: null, rangeCode: 'exceeds_range' });
  });
});
