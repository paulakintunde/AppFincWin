/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { minorUnits } from '../../../money/types';
import { amortise, percent } from '../../../payoff';
import { resolvePlan } from '../../plan';
import type { BuyCheck, CardRecord } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

// D-07 as refined 2026-09-26: no APR is ever invented. The APR is required only where interest is charged
// (months and minimum); the full next-statement payoff charges nothing.
function check(card: CardRecord, payoff: Extract<BuyCheck['payment'], { method: 'card' }>['payoff']): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_450_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'card', card, payoff, dealerCap: null },
  };
}

describe('D-07 card APR is never invented', () => {
  const noApr: CardRecord = { id: 'c1', apr: null, minimumTerms: null, currency: USD };

  it('D-07: a card payment with no APR on record is missing, not priced at 22.9%', () => {
    const r = resolvePlan(check(noApr, { kind: 'months', months: 12 }));
    expect(r).toEqual({ status: 'missing', reasons: ['card_apr_missing'] });
    // What the prototype would have charged with its invented default rate; the engine now refuses to produce it.
    const invented = amortise(m(1_450_000), percent('22.9'), 12);
    expect(invented.totalInterest).toBeGreaterThan(0);
  });

  it('D-07: payoff full needs no APR because nothing is charged', () => {
    const r = resolvePlan(check(noApr, { kind: 'full' }));
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.plan.interest).toBe(0);
    }
  });
});
