/**
 * 04-REVIEW HI-01 regression: `paymentToClearInPromo` must be the smallest level payment that clears the financed
 * balance inside the promo. It was the half-up level payment, so 1,000.00 over a 12-month 0% deferred-interest promo
 * gave 83.33; 12 x 83.33 = 999.96 left 0.04 open at the promo end and the whole deferred interest was charged.
 */
import { minorUnits } from '../../../money/types';
import { ZERO_PERCENT, percent } from '../../../payoff';
import { resolvePlan } from '../../plan';
import type { BuyCheck, CardRecord, Plan, PromoTerms } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

const CARD: CardRecord = { id: 'card-1', apr: percent('24.99'), minimumTerms: null, currency: USD };
const PROMO: PromoTerms = { apr: ZERO_PERCENT, months: 12, deferredInterest: true };

function cardMonths(price: number, months: number, promo: PromoTerms = PROMO): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'card', card: CARD, payoff: { kind: 'months', months }, dealerCap: null, promo },
  };
}

function plan(check: BuyCheck): Plan {
  const r = resolvePlan(check);
  if (r.status !== 'resolved') throw new Error('expected resolved');
  return r.plan;
}

/** Pay `payment` every promo month (the last month pays what is left if that is less); the balance at promo end. */
function balanceAfterPaying(principal: number, payment: number, months: number): number {
  let bal = principal;
  for (let k = 0; k < months; k++) bal -= Math.min(payment, bal);
  return bal;
}

describe('04-REVIEW HI-01: paymentToClearInPromo clears the balance inside the promo', () => {
  it('1,000.00 over a 12-month deferred promo: 83.34, not 83.33, and paying it leaves nothing open', () => {
    const p = plan(cardMonths(100_000, 24));
    expect(p.promo!.paymentToClearInPromo).toBe(8_334);
    expect(balanceAfterPaying(100_000, p.promo!.paymentToClearInPromo, 12)).toBe(0);
    // the smallest such payment: one unit less leaves a balance open at the promo end
    expect(balanceAfterPaying(100_000, p.promo!.paymentToClearInPromo - 1, 12)).toBeGreaterThan(0);
  });

  it('holds for prices from 0.01 to 50.00 over promos of 1 to 24 months', () => {
    for (const months of [1, 2, 3, 6, 7, 11, 12, 18, 24]) {
      for (let price = 1; price <= 5_000; price += 37) {
        const ptc = plan(cardMonths(price, 36, { ...PROMO, months })).promo!.paymentToClearInPromo;
        expect(balanceAfterPaying(price, ptc, months)).toBe(0);
        expect(ptc === 0 || balanceAfterPaying(price, ptc - 1, months) > 0).toBe(true);
      }
    }
  });
});
