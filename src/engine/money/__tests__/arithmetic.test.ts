import fc from 'fast-check';
import { add, subtract, negate, multiplyByInteger, sum, compare, isZero } from '../arithmetic';
import { money, minorUnits, currencyCode, MAX_ABS_AMOUNT_MINOR } from '../types';

describe('add', () => {
  it('adds two Money values of the same currency', () => {
    expect(add(money(100, 'USD'), money(250, 'USD'))).toEqual(money(350, 'USD'));
  });

  it('throws RangeError on a currency mismatch', () => {
    expect(() => add(money(100, 'USD'), money(100, 'EUR'))).toThrow(RangeError);
  });

  it('throws RangeError when the result is not a safe integer', () => {
    const nearMax = money(Number.MAX_SAFE_INTEGER, 'USD');
    expect(() => add(nearMax, money(1, 'USD'))).toThrow(RangeError);
  });
});

describe('subtract', () => {
  it('subtracts two Money values of the same currency', () => {
    expect(subtract(money(250, 'USD'), money(100, 'USD'))).toEqual(money(150, 'USD'));
  });

  it('throws RangeError on a currency mismatch', () => {
    expect(() => subtract(money(100, 'USD'), money(100, 'EUR'))).toThrow(RangeError);
  });
});

describe('negate', () => {
  it('flips the sign of a Money value', () => {
    expect(negate(money(100, 'USD'))).toEqual(money(-100, 'USD'));
    expect(negate(money(-100, 'USD'))).toEqual(money(100, 'USD'));
  });
});

describe('multiplyByInteger', () => {
  it('multiplies by a safe integer factor', () => {
    expect(multiplyByInteger(money(3, 'JPY'), 4)).toEqual(money(12, 'JPY'));
  });

  it('throws RangeError for a non-integer factor', () => {
    expect(() => multiplyByInteger(money(3, 'JPY'), 1.5)).toThrow(RangeError);
  });

  it('throws RangeError when the result is not a safe integer', () => {
    expect(() => multiplyByInteger(money(MAX_ABS_AMOUNT_MINOR, 'JPY'), Number.MAX_SAFE_INTEGER)).toThrow(
      RangeError
    );
  });
});

describe('sum', () => {
  it('is zero for an empty list', () => {
    expect(sum([], currencyCode('USD'))).toEqual(money(0, 'USD'));
  });

  it('adds every item of the matching currency', () => {
    expect(sum([money(100, 'USD'), money(50, 'USD'), money(25, 'USD')], currencyCode('USD'))).toEqual(
      money(175, 'USD')
    );
  });

  it('throws RangeError when an item currency does not match', () => {
    expect(() => sum([money(100, 'USD'), money(50, 'EUR')], currencyCode('USD'))).toThrow(RangeError);
  });
});

describe('compare', () => {
  it('returns -1 when the first amount is smaller', () => {
    expect(compare(money(100, 'USD'), money(200, 'USD'))).toBe(-1);
  });

  it('returns 0 when the amounts are equal', () => {
    expect(compare(money(100, 'USD'), money(100, 'USD'))).toBe(0);
  });

  it('returns 1 when the first amount is larger', () => {
    expect(compare(money(200, 'USD'), money(100, 'USD'))).toBe(1);
  });

  it('throws RangeError on a currency mismatch', () => {
    expect(() => compare(money(100, 'USD'), money(100, 'EUR'))).toThrow(RangeError);
  });
});

describe('isZero', () => {
  it('is true only for a zero amount', () => {
    expect(isZero(money(0, 'USD'))).toBe(true);
    expect(isZero(money(1, 'USD'))).toBe(false);
    expect(isZero(money(-1, 'USD'))).toBe(false);
  });
});

describe('properties', () => {
  it('add is commutative, and add(a, negate(a)) is zero, for any safe-integer pair whose sum is safe', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), fc.maxSafeInteger(), (x, y) => {
        fc.pre(Number.isSafeInteger(x + y));
        const a = { amount: minorUnits(x), currency: currencyCode('USD') };
        const b = { amount: minorUnits(y), currency: currencyCode('USD') };
        expect(add(a, b)).toEqual(add(b, a));
        expect(add(a, negate(a))).toEqual(money(0, 'USD'));
      })
    );
  });
});
