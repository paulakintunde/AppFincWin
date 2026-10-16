/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs
 * from the design mock.
 *
 * 04-REVIEW LO-01: the prototype computes cv as `avg ? sd / avg : 0`, so a history with no logged income at all was
 * Steady, took the `average` basis and could reach `strong` confidence with 6 full months. No income is not steady
 * income: it is now Volatile, with the worst basis, the Volatile cushion and rough confidence.
 */
import { minorUnits } from '../../../money/types';
import { assess, prepareContext } from '../../assess';
import type { BuyCheck } from '../../types';
import { USD, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

describe('LO-01: zero-income history is not steady', () => {
  it('6 full months of zero income: volatile, worst basis, rough confidence (was steady, average, strong)', () => {
    const s = snapshotOf({ months: monthsOf(Array.from({ length: 6 }, () => [0, 100_000] as const), '2026-01') });
    const r = prepareContext(s);
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.money.steadiness).toBe('volatile');
    expect(r.context.money.basis).toBe('worst');
    expect(r.context.money.incomeCvPercent).toBeNull();
    expect(r.context.limits.reserveHalfMonths).toBe(12); // 6 months, the Volatile cushion
    const check: BuyCheck = {
      kind: 'buy',
      currency: USD,
      price: m(1_000),
      dayFees: m(0),
      itemType: 'general',
      runningCostsNet: m(0),
      payment: { method: 'cash' },
    };
    const v = assess(s, check);
    expect(v.confidence).toEqual({ level: 'rough', reasons: ['volatile_income'] });
  });
});
