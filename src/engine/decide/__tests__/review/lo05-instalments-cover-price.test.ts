/**
 * 04-REVIEW LO-05 regression: instalment inputs were not cross-checked against the price. amount x count below the
 * price was accepted, giving a plan whose total sat below the price with 0 interest and a 0 implied rate. The plan is
 * now `missing` with instalment_total_below_price, and the total is computed in bigint.
 */
import { minorUnits } from '../../../money/types';
import { assess } from '../../assess';
import { resolvePlan, withPrice } from '../../plan';
import type { BuyCheck } from '../../types';
import { USD, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function instalments(price: number, amount: number, count: number, dayFees = 0): BuyCheck {
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

describe('04-REVIEW LO-05: instalments must cover the financed price', () => {
  it('instalments short of the price are missing with a code; the verdict is missing', () => {
    expect(resolvePlan(instalments(120_000, 9_999, 12))).toEqual({
      status: 'missing',
      reasons: ['instalment_total_below_price'],
    });
    const v = assess(snapshotOf(), instalments(120_000, 9_999, 12));
    expect(v.state).toBe('missing');
    if (v.state === 'missing') expect(v.reasons).toEqual(['instalment_total_below_price']);
  });

  it('exactly covering, or covering the price less its on-the-day fees, resolves', () => {
    expect(resolvePlan(instalments(120_000, 10_000, 12)).status).toBe('resolved');
    expect(resolvePlan(instalments(125_000, 10_000, 12, 5_000)).status).toBe('resolved');
    expect(resolvePlan(instalments(125_000, 10_000, 12, 4_999)).status).toBe('missing');
  });

  it('a re-priced instalment check (HI-03) always still covers its price', () => {
    const check = instalments(123_457, 10_289, 12, 1_234);
    for (const p of [0, 1, 999, 50_000, 77_777, 123_456, 123_457]) {
      expect(resolvePlan(withPrice(check, m(p))).status).toBe('resolved');
    }
  });
});
