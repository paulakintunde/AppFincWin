import { PAY_METHODS } from '../types';

describe('snapshot contract constants', () => {
  it('lists the pay methods', () => {
    expect(PAY_METHODS).toEqual(['cash', 'loan', 'instalment', 'card']);
  });
});
