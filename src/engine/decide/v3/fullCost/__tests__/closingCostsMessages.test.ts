/**
 * 05.4-61 (D-177 a): the error messages of closingCost, written out.
 */
import type { MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { closingCost } from '../closingCosts';

describe('05.4-61 closingCost error text', () => {
  it('a negative percent says which figure and why', () => {
    const neg = -1n as never;
    expect(() => closingCost(100 as MinorUnits, neg)).toThrow(`closingCost: closing percent ${neg} must be >= 0`);
  });

  it('a result past the safe integer range names closingCost', () => {
    expect(() => closingCost(Number.MAX_SAFE_INTEGER as MinorUnits, percent('200'))).toThrow('closingCost: result exceeds Number.MAX_SAFE_INTEGER');
  });
});
