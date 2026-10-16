/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { resolvePlan } from '../../plan';
import type { BuyCheck, CardRecord } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;
const CARD: CardRecord = {
  id: 'c1',
  apr: percent('22.9'),
  minimumTerms: { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) },
  currency: USD,
};

function check(itemType: BuyCheck['itemType']): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_450_000),
    dayFees: m(0),
    itemType,
    runningCostsNet: m(0),
    payment: { method: 'card', card: CARD, payoff: { kind: 'months', months: 12 }, dealerCap: m(500_000) },
  };
}

describe('D-18 dealer cap remainder', () => {
  it('D-18: a vehicle above the dealer cap puts the excess on day one instead of marking the plan missing', () => {
    // Prototype returned `miss: rule === 'blocked' || rest > 0`, so any vehicle above the cap was missing.
    const r = resolvePlan(check('vehicle'));
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.plan.dayOne).toBe(950_000);
      expect(r.plan.card?.remainderOnDay).toBe(950_000);
      expect(r.plan.card?.onCard).toBe(500_000);
    }
  });

  it('D-18: a blocked item on a card is missing with card_not_accepted', () => {
    expect(resolvePlan(check('rent_bill'))).toEqual({ status: 'missing', reasons: ['card_not_accepted'] });
  });
});
