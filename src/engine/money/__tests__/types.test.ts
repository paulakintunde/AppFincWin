import { minorUnits, currencyCode, money, MAX_ABS_AMOUNT_MINOR } from '../types';

describe('minorUnits', () => {
  it('returns the value unchanged for a safe integer', () => {
    expect(minorUnits(12)).toBe(12);
  });

  it('throws RangeError for a non-integer', () => {
    expect(() => minorUnits(1.5)).toThrow(RangeError);
  });

  it('throws RangeError for NaN', () => {
    expect(() => minorUnits(NaN)).toThrow(RangeError);
  });

  it('throws RangeError for an unsafe integer', () => {
    expect(() => minorUnits(2 ** 53)).toThrow(RangeError);
  });
});

describe('currencyCode', () => {
  it('accepts a 3-letter ISO code', () => {
    expect(currencyCode('USD')).toBe('USD');
  });

  it('accepts a 4-character custom code', () => {
    expect(currencyCode('GLD1')).toBe('GLD1');
  });

  it('throws RangeError for a lowercase code', () => {
    expect(() => currencyCode('usd')).toThrow(RangeError);
  });

  it('throws RangeError for a single character', () => {
    expect(() => currencyCode('U')).toThrow(RangeError);
  });

  it('throws RangeError for more than 4 characters', () => {
    expect(() => currencyCode('ABCDE')).toThrow(RangeError);
  });
});

describe('money', () => {
  it('builds a Money from a valid amount and currency', () => {
    expect(money(1000, 'USD')).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('propagates minorUnits validation', () => {
    expect(() => money(1.5, 'USD')).toThrow(RangeError);
  });

  it('propagates currencyCode validation', () => {
    expect(() => money(1000, 'usd')).toThrow(RangeError);
  });
});

describe('MAX_ABS_AMOUNT_MINOR', () => {
  it('mirrors the DB check value from plan 01-02', () => {
    expect(MAX_ABS_AMOUNT_MINOR).toBe(10_000_000_000_000);
  });
});
