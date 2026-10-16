/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 *
 * Added 2026-10-15 (04-CONTEXT D-48...D-50). The prototype has no promotional rates, deferred interest or late fees;
 * it priced every loan and card at one rate. There is no prototype counterpart, so these tests document the
 * engine's own behaviour for credit terms the user enters (nothing is ever defaulted, D-07).
 */
import { minorUnits } from '../../../money/types';
import { ZERO_PERCENT, percent } from '../../../payoff';
import { resolvePlan } from '../../plan';
import type { BuyCheck, Plan, PromoTerms } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

function loan(promo?: PromoTerms): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_200_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: {
      method: 'loan',
      deposit: m(0),
      termMonths: 36,
      apr: percent('9.9'),
      ...(promo === undefined ? {} : { promo }),
    },
  };
}

function instalment(lateFee?: number): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_400_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: {
      method: 'instalment',
      instalmentAmount: m(62_000),
      instalmentCount: 24,
      ...(lateFee === undefined ? {} : { lateFee: m(lateFee) }),
    },
  };
}

function plan(check: BuyCheck): Plan {
  const r = resolvePlan(check);
  if (r.status !== 'resolved') throw new Error('expected resolved');
  return r.plan;
}

describe('D-48 promotional rates and D-50 late fees', () => {
  it('D-48: the month test uses the highest payment in the schedule, not the promotional one', () => {
    const p = plan(loan({ apr: ZERO_PERCENT, months: 12, deferredInterest: false }));
    expect(p.promo!.paymentDuringPromo).toBe(33_334); // D-64: the level payment rounds up
    expect(p.monthly).toBe(p.promo!.highestMonthlyPayment);
    expect(p.monthly).toBeGreaterThan(p.promo!.paymentDuringPromo);
  });

  it('D-48: deferred interest is charged at the promo end only when the user flagged it and the balance is still open', () => {
    const flagged = plan(loan({ apr: ZERO_PERCENT, months: 12, deferredInterest: true }));
    expect(flagged.promo!.deferredInterestCharged).toBeGreaterThan(0);
    expect(flagged.promo!.deferredInterestCode).toBe('deferred_interest_charged');
    const unflagged = plan(loan({ apr: ZERO_PERCENT, months: 12, deferredInterest: false }));
    expect(unflagged.promo!.deferredInterestCharged).toBe(0);
    expect(unflagged.promo!.deferredInterestCode).toBeNull();
    const cleared = plan(loan({ apr: ZERO_PERCENT, months: 36, deferredInterest: true }));
    expect(cleared.promo!.deferredInterestCharged).toBe(0);
    expect(cleared.promo!.deferredInterestCode).toBeNull();
  });

  it('D-48: no promotional rate is ever assumed', () => {
    const p = plan(loan());
    expect(p.promo).toBeNull();
    // identical to a single-rate amortisation: the first payment is the monthly figure
    expect(p.monthly).toBe(p.paymentSteps[0]!.amount);
  });

  it('D-50: late fees are reported beside the plan and never change it', () => {
    const withFee = plan(instalment(800));
    const without = plan(instalment());
    expect(withFee.lateFees).toMatchObject({ oneLate: 800, twoLate: 1_600 });
    expect(without.lateFees).toBeNull();
    expect({ ...withFee, lateFees: null }).toEqual(without);
  });
});
