/**
 * Named deviation from the prototype (D-91, R16.7, R16.11 E5): the card check limit caps the card portion; the rest is
 * cash on the day. The engine never converts currency: the snapshot passes the limit in home minor units.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { CARD_MAX_PURCHASE_USD } from '../../constants';
import { resolvePlan } from '../../plan';
import type { BuyCheck, CardRecord } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;
type CardPayment = Extract<BuyCheck['payment'], { method: 'card' }>;
const CARD: CardRecord = {
  id: 'c1',
  apr: percent('22.9'),
  minimumTerms: { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) },
  currency: USD,
};

function check(itemType: BuyCheck['itemType'], price: number, extra: Partial<CardPayment>): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType,
    runningCostsNet: m(0),
    payment: { method: 'card', card: CARD, payoff: { kind: 'months', months: 12 }, dealerCap: null, ...extra },
  };
}

describe('D-91 card check limit', () => {
  it('D-91 the check limit caps the card portion and the rest is cash on the day', () => {
    const r = resolvePlan(check('general', 15_000_000, { cardMaxPurchase: m(CARD_MAX_PURCHASE_USD) }));
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.plan.card?.onCard).toBe(10_000_000);
      expect(r.plan.card?.remainderOnDay).toBe(5_000_000);
      expect(r.plan.card?.capBy).toBe('check_limit');
      expect(r.plan.dayOne).toBe(5_000_000);
    }
  });

  it('D-91 the lower cap wins', () => {
    const dealer = resolvePlan(check('vehicle', 15_000_000, { dealerCap: m(500_000), cardMaxPurchase: m(10_000_000) }));
    expect(dealer.status === 'resolved' && dealer.plan.card?.onCard).toBe(500_000);
    expect(dealer.status === 'resolved' && dealer.plan.card?.capBy).toBe('dealer');
    const limit = resolvePlan(check('vehicle', 15_000_000, { dealerCap: m(20_000_000), cardMaxPurchase: m(300_000) }));
    expect(limit.status === 'resolved' && limit.plan.card?.onCard).toBe(300_000);
    expect(limit.status === 'resolved' && limit.plan.card?.capBy).toBe('check_limit');
    // a tie is the dealer's cap (reported first); a price under both caps is uncapped
    const tie = resolvePlan(check('vehicle', 15_000_000, { dealerCap: m(400_000), cardMaxPurchase: m(400_000) }));
    expect(tie.status === 'resolved' && tie.plan.card?.capBy).toBe('dealer');
    const under = resolvePlan(check('vehicle', 100_000, { dealerCap: m(400_000), cardMaxPurchase: m(400_000) }));
    expect(under.status === 'resolved' && under.plan.card?.capBy).toBeNull();
    expect(under.status === 'resolved' && under.plan.card?.remainderOnDay).toBe(0);
  });

  it('D-91 no converted limit is card_limit_rate_missing', () => {
    expect(resolvePlan(check('general', 100_000, { cardMaxPurchase: null }))).toEqual({
      status: 'missing',
      reasons: ['card_limit_rate_missing'],
    });
  });

  it('D-91 an absent limit changes nothing', () => {
    const r = resolvePlan(check('general', 15_000_000, {}));
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.plan.card?.onCard).toBe(15_000_000);
      expect(r.plan.card?.remainderOnDay).toBe(0);
      expect(r.plan.card?.capBy).toBeNull();
    }
  });

  it('D-91 a negative limit is rejected', () => {
    expect(() => resolvePlan(check('general', 100_000, { cardMaxPurchase: m(-1) }))).toThrow();
  });
});
