/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { minorUnits } from '../../../money/types';
import { resolvePlan } from '../../plan';
import type { BuyCheck } from '../../types';
import { USD } from '../helpers/fixtures';

const m = minorUnits;

function check(amount: number | null, count: number | null): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_180_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: { method: 'instalment', instalmentAmount: amount === null ? null : m(amount), instalmentCount: count },
  };
}

describe('Instalment path', () => {
  it('Instalment plans resolve when amount and count are present (prototype returned miss: true unconditionally)', () => {
    // Prototype: `miss: true` on every instalment plan, so the verdict was always "missing". Treated as a bug.
    const r = resolvePlan(check(62_000, 24));
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.plan.total).toBe(1_488_000);
    }
  });

  it('Instalment plan is missing only for absent amount or count', () => {
    expect(resolvePlan(check(null, 24)).status).toBe('missing');
    expect(resolvePlan(check(62_000, null)).status).toBe('missing');
    expect(resolvePlan(check(62_000, 24)).status).toBe('resolved');
  });
});
