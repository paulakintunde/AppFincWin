/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { simulateMinimum } from '../../simulateMinimum';
import { percent } from '../../types';
import { minorUnits } from '../../../money/types';

const m = minorUnits;

describe('D-17 never-clears versus the month cap', () => {
  it('D-17: never-clears fires on the first month the payment cannot cover interest, not at the cap', () => {
    // Prototype: looped up to its cap before concluding; here the check is explicit per month.
    const r = simulateMinimum(m(500_000), percent('22.9'), {
      minimumPercent: percent('1'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(r.outcome).toBe('never_clears');
    expect(r.months).toBe(1);
  });

  it('D-17: a balance open at 600 months is exceeds_month_cap, never never_clears', () => {
    // Prototype: conflated "hit the cap" with "never clears".
    const r = simulateMinimum(m(1_000_000), percent('22.9'), {
      minimumPercent: percent('2'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(r.outcome).toBe('exceeds_month_cap');
  });

  it('D-17: never-clears reports totalInterest as null; the prototype substituted cap × 3 in dplan', () => {
    // Note only: the dplan substitution is removed in 04-06.
    const r = simulateMinimum(m(500_000), percent('22.9'), {
      minimumPercent: percent('1'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(r.totalInterest).toBeNull();
  });
});
