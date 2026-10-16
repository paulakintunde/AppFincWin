import { confidenceOf } from '../confidence';
import type { Steadiness } from '../types';

const c = (fullMonths: number, steadiness: Steadiness | null, firstRead = false) =>
  confidenceOf({ fullMonths, steadiness, firstRead });

describe('confidenceOf', () => {
  it('a first read is rough', () => {
    expect(c(0, null, true)).toEqual({ level: 'rough', reasons: ['first_read'] });
    expect(c(8, 'steady', true)).toEqual({ level: 'rough', reasons: ['first_read'] });
  });

  it('under 3 full months is rough', () => {
    expect(c(0, null)).toEqual({ level: 'rough', reasons: ['under_3_full_months'] });
    expect(c(2, 'insufficient')).toEqual({ level: 'rough', reasons: ['under_3_full_months'] });
  });

  it('volatile income is rough whatever the history', () => {
    expect(c(8, 'volatile')).toEqual({ level: 'rough', reasons: ['volatile_income'] });
    expect(c(4, 'volatile')).toEqual({ level: 'rough', reasons: ['volatile_income'] });
  });

  it('6 or more full months and steady is strong', () => {
    expect(c(6, 'steady')).toEqual({ level: 'strong', reasons: [] });
    expect(c(8, 'steady')).toEqual({ level: 'strong', reasons: [] });
  });

  it('otherwise fair with every applicable reason', () => {
    expect(c(5, 'steady')).toEqual({ level: 'fair', reasons: ['under_6_full_months'] });
    expect(c(3, 'steady')).toEqual({ level: 'fair', reasons: ['under_6_full_months'] });
    expect(c(6, 'variable')).toEqual({ level: 'fair', reasons: ['variable_income'] });
    expect(c(4, 'variable')).toEqual({ level: 'fair', reasons: ['under_6_full_months', 'variable_income'] });
  });

  it('rejects inconsistent inputs', () => {
    expect(() => c(-1, null)).toThrow(/^confidenceOf: /);
    expect(() => c(1.5, null)).toThrow(/^confidenceOf: /);
    expect(() => c(3, 'insufficient')).toThrow(/^confidenceOf: /);
    for (const s of ['steady', 'variable', 'volatile'] as const) {
      expect(() => c(2, s)).toThrow(/^confidenceOf: /);
    }
  });
});
