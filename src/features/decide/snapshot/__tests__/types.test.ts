import { CREDIT_TERMS, EMPTY_STACK, PAY_METHODS } from '../types';

describe('snapshot contract constants', () => {
  it('lists the pay methods, the credit terms and an empty stack selection', () => {
    expect(PAY_METHODS).toEqual(['cash', 'loan', 'instalment', 'card']);
    expect(CREDIT_TERMS).toEqual([12, 24, 36, 48, 60]);
    expect(EMPTY_STACK).toEqual({ otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 });
  });
});
