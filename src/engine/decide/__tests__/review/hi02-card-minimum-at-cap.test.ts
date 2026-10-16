/**
 * 04-REVIEW HI-02 regression (D-17): a card minimum still open at the 600-month cap must not report a finite "cleared"
 * cost. Reproduced before the fix: 100,000.00 at 5% APR, 0.5% minimum, no interest added, floor 0 gave
 * outcome 'exceeds_month_cap' and remainingBalance 6,064,042, yet total 29,679,778, interest 19,679,778 and
 * payoffMonths 600, understating the cost by the whole open balance.
 */
import { minorUnits } from '../../../money/types';
import { SIMULATION_MONTH_CAP, ZERO_PERCENT, percent, simulateMinimumSchedule, singleRate } from '../../../payoff';
import { resolvePlan } from '../../plan';
import type { BuyCheck, CardRecord, Plan, PromoTerms } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

const SLOW: CardRecord = {
  id: 'card-slow',
  apr: percent('5'),
  minimumTerms: { minimumPercent: percent('0.5'), interestAdded: false, floor: m(0) },
  currency: USD,
};

function minimum(card: CardRecord, promo?: PromoTerms, cardFees?: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(10_000_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: {
      method: 'card',
      card,
      payoff: { kind: 'minimum' },
      dealerCap: null,
      ...(promo === undefined ? {} : { promo }),
      ...(cardFees === undefined ? {} : { cardFees: m(cardFees) }),
    },
  };
}

function plan(check: BuyCheck): Plan {
  const r = resolvePlan(check);
  if (r.status !== 'resolved') throw new Error('expected resolved');
  return r.plan;
}

describe('04-REVIEW HI-02: a card minimum open at the 600-month cap is not a cleared cost', () => {
  it('reports exceeds_month_cap with the open balance and no finite total, interest, cardCosts or payoff months', () => {
    const p = plan(minimum(SLOW, undefined, 2_500));
    const s = simulateMinimumSchedule(m(10_000_000), singleRate(percent('5')), SLOW.minimumTerms!);
    expect(s.outcome).toBe('exceeds_month_cap');
    expect(s.remainingBalance).toBe(6_064_042);
    expect(p.card).toMatchObject({
      minimumOutcome: 'exceeds_month_cap',
      remainingAtCap: 6_064_042,
      payoffMonths: null,
      cardCosts: null,
      fees: 2_500,
    });
    expect(p.total).toBeNull();
    expect(p.interest).toBeNull();
    // the payments really run to the cap
    expect(p.months).toBe(SIMULATION_MONTH_CAP);
    expect(p.paymentSteps[p.paymentSteps.length - 1]!.toMonth).toBe(SIMULATION_MONTH_CAP);
  });

  it('with a promo, interest after the promo is not a finite figure either', () => {
    const p = plan(minimum(SLOW, { apr: ZERO_PERCENT, months: 6, deferredInterest: false }));
    expect(p.card!.minimumOutcome).toBe('exceeds_month_cap');
    expect(p.card!.remainingAtCap).toBeGreaterThan(0);
    expect(p.promo!.interestAfterPromo).toBeNull();
    expect(p.total).toBeNull();
  });

  it('remainingAtCap is null for a minimum that clears and for one that never clears', () => {
    const clears: CardRecord = {
      ...SLOW,
      apr: percent('22.9'),
      minimumTerms: { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) },
    };
    const cleared = plan(minimum(clears));
    expect(cleared.card!.minimumOutcome).toBe('cleared');
    expect(cleared.card!.remainingAtCap).toBeNull();
    expect(cleared.total).not.toBeNull();
    const never: CardRecord = { ...SLOW, apr: percent('30') };
    const n = plan(minimum(never));
    expect(n.card!.minimumOutcome).toBe('never_clears');
    expect(n.card!.remainingAtCap).toBeNull();
  });
});
