/**
 * Named deviation (D-69, 2026-10-22): a line saved while its own rate was pending is converted at the latest stored rate
 * by the Phase 5 snapshot builder, which then sets `snapshot.provisionalRates`. The engine never sees the rows; it reads
 * the plain flag and caps confidence at fair ("Medium"), listing 'provisional_rates' among the reasons. Rough stays rough
 * (the reason is added); a first read is unchanged.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { confidenceOf } from '../../confidence';
import { assess } from '../../assess';
import { decide } from '../../decision';
import type { BuyCheck } from '../../types';
import { USD, buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

const steadySix = () => monthsOf(Array.from({ length: 6 }, () => [500_000, 300_000] as const), '2026-01');
const loanMissingTerm: BuyCheck = {
  kind: 'buy',
  currency: USD,
  price: minorUnits(100_000),
  dayFees: minorUnits(0),
  itemType: 'general',
  runningCostsNet: minorUnits(0),
  payment: { method: 'loan', deposit: minorUnits(0), termMonths: null, apr: null },
};

describe('D-69: confidence is capped at fair when a line uses a provisional rate', () => {
  it('confidenceOf: strong becomes fair with the provisional reason', () => {
    expect(confidenceOf({ fullMonths: 6, steadiness: 'steady', firstRead: false, provisionalRates: true })).toEqual({
      level: 'fair',
      reasons: ['provisional_rates'],
    });
    expect(confidenceOf({ fullMonths: 6, steadiness: 'steady', firstRead: false, provisionalRates: false })).toEqual({
      level: 'strong',
      reasons: [],
    });
  });

  it('confidenceOf: fair keeps its reasons and adds the provisional one', () => {
    expect(confidenceOf({ fullMonths: 4, steadiness: 'variable', firstRead: false, provisionalRates: true })).toEqual({
      level: 'fair',
      reasons: ['under_6_full_months', 'variable_income', 'provisional_rates'],
    });
  });

  it('confidenceOf: rough stays rough with the provisional reason listed; a first read is unchanged', () => {
    expect(confidenceOf({ fullMonths: 2, steadiness: 'insufficient', firstRead: false, provisionalRates: true })).toEqual({
      level: 'rough',
      reasons: ['under_3_full_months', 'provisional_rates'],
    });
    expect(confidenceOf({ fullMonths: 0, steadiness: null, firstRead: true, provisionalRates: true })).toEqual({
      level: 'rough',
      reasons: ['first_read'],
    });
  });

  it('assess: a resolved verdict on 6 steady months is strong, and fair when provisionalRates is set', () => {
    expect(assess(snapshotOf({ months: steadySix() }), buyCash(100_000)).confidence).toEqual({ level: 'strong', reasons: [] });
    expect(assess(snapshotOf({ months: steadySix(), provisionalRates: true }), buyCash(100_000)).confidence).toEqual({
      level: 'fair',
      reasons: ['provisional_rates'],
    });
  });

  it('assess: a missing plan carries the capped confidence', () => {
    const v = assess(snapshotOf({ months: steadySix(), provisionalRates: true }), loanMissingTerm);
    expect(v.state).toBe('missing');
    expect(v.confidence).toEqual({ level: 'fair', reasons: ['provisional_rates'] });
  });

  it('assess: a context that does not resolve carries the provisional reason too', () => {
    const outOfRange = assess(
      snapshotOf({ months: steadySix(), provisionalRates: true, projectionRates: [percent('150')] }),
      buyCash(100_000)
    );
    expect(outOfRange.confidence).toEqual({ level: 'fair', reasons: ['provisional_rates'] });
    const noMonths = assess(snapshotOf({ months: [], provisionalRates: true }), buyCash(100_000));
    expect(noMonths.confidence).toEqual({ level: 'rough', reasons: ['under_3_full_months', 'provisional_rates'] });
  });

  it('decide: the missing verdict is capped as well', () => {
    const d = decide(snapshotOf({ months: steadySix(), provisionalRates: true }), loanMissingTerm);
    expect(d.verdict.confidence).toEqual({ level: 'fair', reasons: ['provisional_rates'] });
  });
});
