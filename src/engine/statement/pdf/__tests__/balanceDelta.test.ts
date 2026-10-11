import fc from 'fast-check';
import { balanceStep, learnDebitDirection, pickByDelta } from '../balanceDelta';

describe('balanceStep', () => {
  it('reads the direction of a balance change that matches the magnitude', () => {
    expect(balanceStep(44528, 65482, 20954)).toBe(1);
    expect(balanceStep(65482, 44528, 20954)).toBe(-1);
    expect(balanceStep(-12040, 5000, 17040)).toBe(1);
  });

  it('returns null when nothing matches or the magnitude is zero', () => {
    expect(balanceStep(100, 200, 99)).toBeNull();
    expect(balanceStep(100, 100, 0)).toBeNull();
  });

  it('compares exactly near the ceiling', () => {
    expect(balanceStep(-1e13, 1e13, 2e13)).toBe(1);
    expect(balanceStep(1e13, -1e13, 2e13)).toBe(-1);
    expect(balanceStep(-1e13, 1e13, 2e13 - 1)).toBeNull();
  });

  it('property: exact in both directions', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), fc.integer({ min: 1, max: 1e13 }), (previous, magnitude) => {
        expect(balanceStep(previous, previous + magnitude, magnitude)).toBe(1);
        expect(balanceStep(previous, previous - magnitude, magnitude)).toBe(-1);
      })
    );
  });
});

describe('learnDebitDirection', () => {
  const many = (column: 'debit' | 'credit', step: 1 | -1, n: number) => Array.from({ length: n }, () => ({ column, step }));

  it('learns that debits lower the balance', () => {
    expect(learnDebitDirection([...many('debit', -1, 5), ...many('credit', 1, 4)])).toBe(-1);
  });

  it('learns card-style statements', () => {
    expect(learnDebitDirection([...many('debit', 1, 3), ...many('credit', -1, 1)])).toBe(1);
  });

  it('returns null with no samples, a split, or under 90% agreement', () => {
    expect(learnDebitDirection([])).toBeNull();
    expect(learnDebitDirection([...many('debit', -1, 5), ...many('debit', 1, 5)])).toBeNull();
    expect(learnDebitDirection([...many('debit', -1, 8), ...many('debit', 1, 2)])).toBeNull();
  });

  it('accepts exactly 90% agreement', () => {
    expect(learnDebitDirection([...many('debit', -1, 9), ...many('debit', 1, 1)])).toBe(-1);
  });
});

describe('pickByDelta', () => {
  it('picks the one candidate equal to the balance change', () => {
    expect(pickByDelta(0, 1500, [1500, 200])).toEqual({ index: 0, step: 1 });
    expect(pickByDelta(1500, 0, [200, 1500])).toEqual({ index: 1, step: -1 });
  });

  it('returns null for two matches, none, or no change', () => {
    expect(pickByDelta(0, 1500, [1500, 1500])).toBeNull();
    expect(pickByDelta(0, 1500, [200, 300])).toBeNull();
    expect(pickByDelta(0, 1500, [])).toBeNull();
    expect(pickByDelta(100, 100, [0, 5])).toBeNull();
  });
});
