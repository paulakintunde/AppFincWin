/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 *
 * Added 2026-10-15 (04-CONTEXT D-51, amends D-06): the prototype projected at an assumed 6.5% return. The engine now
 * supplies no non-zero rate: every projection is returned at 0% and at the (up to three) rates the user typed.
 */
import { minorUnits } from '../../../money/types';
import { percent, ZERO_PERCENT } from '../../../payoff/types';
import { assessPlan, prepareContext } from '../../assess';
import { investmentViews } from '../../investmentViews';
import { resolvePlanStrict } from '../../plan';
import type { DecideSnapshot } from '../../types';
import { buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function viewsOf(over: Partial<DecideSnapshot>) {
  const r = prepareContext(snapshotOf(over));
  if (!r.ok) throw new Error('expected a resolved context');
  const check = buyCash(1_200_000);
  const a = assessPlan(r.context, check, resolvePlanStrict(check));
  return investmentViews(r.context, check, a, { horizonMonths: null, holdingFee: null });
}

describe('D-51 investment views', () => {
  it('D-51: projections use 0% plus only the rates the user entered; the engine supplies none', () => {
    // Prototype: a fixed 6.5% return assumed whatever the user entered.
    const v = viewsOf({});
    expect(v.rates.map((r) => r.rate)).toEqual([ZERO_PERCENT]);
    for (const figures of [v.priceInvested.byRate, v.paymentsInvested.byRate]) {
      for (const f of figures) {
        expect(f.rate).toBe(ZERO_PERCENT);
        expect(f.growth).toBe(0);
      }
    }
    expect(v.priceInvested.byRate[0]!.projected).toBe(m(1_200_000));
    const entered = viewsOf({ projectionRates: [percent('5')] });
    expect(entered.rates.map((r) => r.rate)).toEqual([ZERO_PERCENT, percent('5')]);
  });

  it('D-51: a user-entered 0% is returned once', () => {
    const v = viewsOf({ projectionRates: [ZERO_PERCENT, ZERO_PERCENT] });
    expect(v.rates).toHaveLength(1);
    expect(v.priceInvested.byRate).toHaveLength(1);
    expect(v.rates[0]!.userEntered).toBe(true);
  });

  it('D-51: every non-zero rate is labelled as a projection at the rate you entered', () => {
    const v = viewsOf({ projectionRates: [percent('4'), percent('9')] });
    const nonZero = v.rates.filter((r) => r.rate !== ZERO_PERCENT);
    expect(nonZero).toHaveLength(2);
    for (const r of nonZero) {
      expect(r.userEntered).toBe(true);
      expect(r.label).toBe('projection_at_entered_rate');
    }
    expect(v.rates[0]!.label).toBe('held_not_grown');
  });
});
