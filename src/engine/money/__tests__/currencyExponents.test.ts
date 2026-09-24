import fixtures from '../../../../supabase/tests/fixtures/money-conversion-cases.json';
import { ISO_EXPONENT_EXCEPTIONS, currencyExponent, resolveExponent } from '../currencyExponents';

describe('currencyExponent', () => {
  it.each(fixtures.exponents)('$code resolves to $exponent', ({ code, exponent }) => {
    expect(currencyExponent(code)).toBe(exponent);
  });

  it('defaults to 2 for an unlisted ISO code', () => {
    expect(currencyExponent('XYZ')).toBe(2);
  });
});

describe('ISO_EXPONENT_EXCEPTIONS', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(ISO_EXPONENT_EXCEPTIONS)).toBe(true);
  });
});

describe('resolveExponent', () => {
  it('returns customDecimals when provided and valid', () => {
    expect(resolveExponent('GLD', 0)).toBe(0);
  });

  it('accepts the top of the valid customDecimals range', () => {
    expect(resolveExponent('GLD', 4)).toBe(4);
  });

  it('throws RangeError when customDecimals exceeds the valid range', () => {
    expect(() => resolveExponent('GLD', 5)).toThrow(RangeError);
  });

  it('throws RangeError when customDecimals is negative', () => {
    expect(() => resolveExponent('GLD', -1)).toThrow(RangeError);
  });

  it('throws RangeError when customDecimals is not an integer', () => {
    expect(() => resolveExponent('GLD', 1.5)).toThrow(RangeError);
  });

  it('falls back to currencyExponent when customDecimals is not provided', () => {
    expect(resolveExponent('JPY')).toBe(0);
    expect(resolveExponent('USD')).toBe(2);
  });
});
