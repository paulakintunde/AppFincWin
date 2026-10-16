import {
  ONE_HUNDRED_PERCENT,
  MONTHLY_RATE_DENOMINATOR,
  PERCENT_SCALE,
  ZERO_PERCENT,
  ceilDivide,
  minorFromBigInt,
  percent,
  percentFromScaled,
} from '../types';
import { MAX_TERM_MONTHS, SIMULATION_MONTH_CAP } from '../constants';

describe('percent', () => {
  it.each([
    ['22.9', 229_000_000_000n],
    ['0', 0n],
    ['36', 360_000_000_000n],
    ['0.0000000001', 1n],
    ['9999.5', 99_995_000_000_000n],
  ])('parses %s', (s, expected) => {
    expect(percent(s)).toBe(expected);
  });

  it.each(['', '-1', '1.', '.5', '1.23456789012', '10000', 'abc'])('rejects %j', (s) => {
    expect(() => percent(s)).toThrow(RangeError);
    expect(() => percent(s)).toThrow(/^percent: /);
  });
});

describe('percentFromScaled', () => {
  it('accepts zero and positives', () => {
    expect(percentFromScaled(5n)).toBe(5n);
    expect(percentFromScaled(0n)).toBe(0n);
  });
  it('rejects negatives', () => {
    expect(() => percentFromScaled(-1n)).toThrow(RangeError);
  });
});

describe('constants', () => {
  it('has the documented scales', () => {
    expect(ZERO_PERCENT).toBe(0n);
    expect(PERCENT_SCALE).toBe(10_000_000_000n);
    expect(ONE_HUNDRED_PERCENT).toBe(1_000_000_000_000n);
    expect(MONTHLY_RATE_DENOMINATOR).toBe(12_000_000_000_000n);
    expect(SIMULATION_MONTH_CAP).toBe(600);
    expect(MAX_TERM_MONTHS).toBe(600);
  });
});

describe('minorFromBigInt', () => {
  it('converts safe values', () => {
    expect(minorFromBigInt(123n, 'f')).toBe(123);
  });
  it('throws beyond the safe range in either direction', () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => minorFromBigInt(big, 'f')).toThrow('f: result exceeds Number.MAX_SAFE_INTEGER');
    expect(() => minorFromBigInt(-big, 'f')).toThrow('f: result exceeds Number.MAX_SAFE_INTEGER');
  });
});

describe('ceilDivide', () => {
  it('rounds up', () => {
    expect(ceilDivide(10n, 3n)).toBe(4n);
    expect(ceilDivide(9n, 3n)).toBe(3n);
    expect(ceilDivide(0n, 5n)).toBe(0n);
  });
  it('guards', () => {
    expect(() => ceilDivide(1n, 0n)).toThrow(RangeError);
    expect(() => ceilDivide(-1n, 2n)).toThrow(RangeError);
  });
});
