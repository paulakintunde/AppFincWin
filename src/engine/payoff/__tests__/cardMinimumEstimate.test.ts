import {
  CARD_MIN_ESTIMATE_FLOOR,
  CARD_MIN_ESTIMATE_PERCENT,
  cardMinEstimateFloor,
  estimatedCardMinimum,
} from '../cardMinimumEstimate';
import { ZERO_PERCENT, percent } from '../types';
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

describe('estimatedCardMinimum floor by currency decimals (fixer C handoff)', () => {
  it('is 25 whole units in any currency', () => {
    expect(cardMinEstimateFloor()).toBe(2500);
    expect(cardMinEstimateFloor(0)).toBe(25);
    expect(cardMinEstimateFloor(3)).toBe(25000);
    expect(estimatedCardMinimum(minorUnits(30), ZERO_PERCENT, 0)).toBe(25); // ¥30 owed: 1% is under the ¥25 floor
    expect(estimatedCardMinimum(minorUnits(20), ZERO_PERCENT, 0)).toBe(20); // never more than is owed
    expect(estimatedCardMinimum(minorUnits(1_000), ZERO_PERCENT, 0)).toBe(25);
    expect(estimatedCardMinimum(minorUnits(1_000_000), ZERO_PERCENT, 3)).toBe(25_000); // 1,000 KWD: 10 KWD is under 25 KWD
    expect(estimatedCardMinimum(minorUnits(10_000), ZERO_PERCENT)).toBe(2500); // default stays 2 decimals
    expect(() => cardMinEstimateFloor(5)).toThrow(RangeError);
    expect(() => cardMinEstimateFloor(1.5)).toThrow(RangeError);
  });
});
