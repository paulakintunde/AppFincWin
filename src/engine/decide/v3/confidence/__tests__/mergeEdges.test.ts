/**
 * 05.4-61 (D-177 a): mergeConfidence lists a reason both readings carry once, with the first reading's numbers.
 */
import { minorUnits } from '../../../../money/types';
import { confidenceOf, mergeConfidence } from '../reasons';

const input = (monthsUsed: number) => ({ monthsUsed, day: 20, everydayLogged: minorUnits(100_000), e: minorUnits(100_000), typedEstimatesUsed: false, provisionalRates: false, upTo: '2026-11-15' });

describe('05.4-61 mergeConfidence', () => {
  it('a reason both carry appears once, with the first reading\'s numbers', () => {
    const a = confidenceOf(input(1));
    const b = confidenceOf(input(2));
    const m = mergeConfidence(a, b);
    expect(m.reasons.filter((r) => r.code === 'few_months')).toHaveLength(1);
    expect(m.reasons.find((r) => r.code === 'few_months')?.numbers).toEqual({ used: 1, lookedFor: 3 });
    expect(mergeConfidence(a, a).reasons).toEqual(a.reasons);
  });

  it('a reason only the second carries is added', () => {
    const a = confidenceOf(input(3));
    const b = confidenceOf(input(1));
    expect(a.reasons.map((r) => r.code)).not.toContain('few_months');
    expect(mergeConfidence(a, b).reasons.map((r) => r.code)).toContain('few_months');
  });
});
