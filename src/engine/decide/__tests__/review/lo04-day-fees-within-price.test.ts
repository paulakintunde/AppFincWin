/**
 * 04-REVIEW LO-04 regression: when take-off lines exceed the advertised price plus adds, the price floors at 0 but
 * dayFees kept the on-day adds, so a loan's dayOne exceeded the price and the difference showed as "interest".
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { resolvePriceInputs } from '../../checkInputs';
import { resolvePlanStrict } from '../../plan';
import type { BuyCheck, PriceAdjustment } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

const adj = (id: string, amount: number, effect: PriceAdjustment['effect'], onDay: boolean): PriceAdjustment => ({
  id,
  amount: m(amount),
  effect,
  onDay,
  counted: true,
});

describe('04-REVIEW LO-04: on-the-day fees never exceed the resolved price', () => {
  it('a trade-in larger than price plus fees floors both at 0', () => {
    const r = resolvePriceInputs({
      advertised: m(100_000),
      adjustments: [adj('fee', 5_000, 'adds', true), adj('trade-in', 200_000, 'takes_off', false)],
    });
    expect(r.price).toBe(0);
    expect(r.dayFees).toBe(0);
    const check: BuyCheck = {
      kind: 'buy',
      currency: USD,
      price: r.price,
      dayFees: r.dayFees,
      itemType: 'general',
      runningCostsNet: m(0),
      payment: { method: 'loan', deposit: m(0), termMonths: 12, apr: percent('9.9') },
    };
    const p = resolvePlanStrict(check);
    expect(p.dayOne).toBeLessThanOrEqual(p.price);
    expect(p.interest).toBe(0);
  });

  it('a partial trade-in keeps the fees whole while the price still covers them', () => {
    const r = resolvePriceInputs({
      advertised: m(100_000),
      adjustments: [adj('fee', 5_000, 'adds', true), adj('trade-in', 102_000, 'takes_off', false)],
    });
    expect(r.price).toBe(3_000);
    expect(r.dayFees).toBe(3_000);
    const r2 = resolvePriceInputs({
      advertised: m(100_000),
      adjustments: [adj('fee', 5_000, 'adds', true), adj('trade-in', 50_000, 'takes_off', false)],
    });
    expect(r2).toMatchObject({ price: 55_000, dayFees: 5_000 });
  });
});
