import fc from 'fast-check';
import fixtures from '../../../../supabase/tests/fixtures/money-conversion-cases.json';
import { divideHalfUp } from '../rounding';

describe('divideHalfUp', () => {
  it.each(fixtures.halfUp)(
    '$numerator / $denominator = $expected (half-up, away from zero)',
    ({ numerator, denominator, expected }) => {
      expect(divideHalfUp(BigInt(numerator), BigInt(denominator))).toBe(BigInt(expected));
    }
  );

  it('throws RangeError for a zero denominator', () => {
    expect(() => divideHalfUp(1n, 0n)).toThrow(RangeError);
  });

  it('throws RangeError for a negative denominator', () => {
    expect(() => divideHalfUp(1n, -2n)).toThrow(RangeError);
  });

  it('property: the rounding error never exceeds half the denominator, and negation is symmetric', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.bigInt({ min: 1n }), (n, d) => {
        const q = divideHalfUp(n, d);
        const error = q * d - n;
        const absError = error < 0n ? -error : error;
        expect(absError * 2n <= d).toBe(true);
        expect(divideHalfUp(-n, d)).toBe(-divideHalfUp(n, d));
      })
    );
  });
});
