import {
  CARD_MIN_ESTIMATE_FLOOR,
  CARD_MIN_ESTIMATE_PERCENT,
  estimatedCardMinimum,
} from '../cardMinimumEstimate';
import { percent } from '../types';
import { minorUnits, type MinorUnits } from '../../money/types';

const m = minorUnits;

describe('estimatedCardMinimum', () => {
  it('documents the rule constants', () => {
    expect(CARD_MIN_ESTIMATE_PERCENT).toBe(1);
    expect(CARD_MIN_ESTIMATE_FLOOR).toBe(2_500);
  });

  it('month-1 interest plus 1% of the balance', () => {
    expect(estimatedCardMinimum(m(420_000), percent('21.9'))).toBe(7_665 + 4_200);
  });

  it('applies the floor', () => {
    expect(estimatedCardMinimum(m(100_000), percent('0'))).toBe(2_500);
  });

  it('never exceeds what is owed', () => {
    expect(estimatedCardMinimum(m(1_500), percent('20'))).toBe(1_525);
  });

  it('zero balance gives zero', () => {
    expect(estimatedCardMinimum(m(0), percent('20'))).toBe(0);
  });

  it('negative balance throws', () => {
    expect(() => estimatedCardMinimum(-1 as MinorUnits, percent('1'))).toThrow(/^estimatedCardMinimum: /);
  });
});
