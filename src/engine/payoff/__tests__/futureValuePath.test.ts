import fc from 'fast-check';
import { futureValue } from '../futureValue';
import { futureValueNet, futureValuePath } from '../futureValuePath';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, percent, percentFromScaled } from '../types';
import { minorUnits } from '../../money/types';

const m = minorUnits;

describe('futureValuePath known values', () => {
  it('monthly only, 12% for 12 months', () => {
    const path = futureValuePath(m(10_000), percent('12'), 12, m(0), ZERO_PERCENT);
    expect(path[12]).toBe(126_825);
    expect(path[0]).toBe(0);
    expect(path).toHaveLength(13);
  });
  it('seed only', () => {
    expect(futureValuePath(m(0), percent('12'), 12, m(100_000), ZERO_PERCENT)[12]).toBe(112_683);
  });
  it('zero rate is seed + monthly x m at every month', () => {
    const path = futureValuePath(m(25_000), ZERO_PERCENT, 24, m(50_000), ZERO_PERCENT);
    for (let i = 0; i <= 24; i += 1) {
      expect(path[i]).toBe(50_000 + 25_000 * i);
    }
  });
  it('zero months is the seed alone', () => {
    expect(futureValuePath(m(10_000), percent('5'), 0, m(70_000), ZERO_PERCENT)).toEqual([70_000]);
  });
});

describe('futureValueNet holding fee (D-63)', () => {
  it('a 13% rate less a 1% fee equals 12%', () => {
    expect(futureValueNet(m(10_000), percent('13'), 12, m(0), percent('1'))).toBe(126_825);
  });
  it('net 0 is seed + monthly x n', () => {
    expect(futureValueNet(m(10_000), percent('12'), 12, m(0), percent('12'))).toBe(120_000);
  });
  it('0% with a 1% fee shrinks the seed', () => {
    expect(futureValueNet(m(0), ZERO_PERCENT, 12, m(100_000), percent('1'))).toBe(99_005);
  });
  it('0% with a 1% fee on contributions', () => {
    expect(futureValueNet(m(10_000), ZERO_PERCENT, 12, m(0), percent('1'))).toBe(119_452);
    expect(futureValueNet(m(25_000), ZERO_PERCENT, 12, m(0), percent('0.5'))).toBe(299_313);
  });
  it('path with a fee and a seed', () => {
    expect(futureValuePath(m(40_000), ZERO_PERCENT, 12, m(500_000), percent('1'))[12]).toBe(972_829);
  });
  it('a zero fee is exactly futureValue', () => {
    expect(futureValueNet(m(10_000), percent('12'), 12, m(100_000), ZERO_PERCENT)).toBe(
      futureValue(m(10_000), percent('12'), 12, m(100_000))
    );
    expect(futureValueNet(m(25_000), ZERO_PERCENT, 24, m(50_000), ZERO_PERCENT)).toBe(650_000);
  });
  it('zero months returns the seed with or without a fee', () => {
    expect(futureValueNet(m(10_000), percent('5'), 0, m(70_000), percent('1'))).toBe(70_000);
  });
});

describe('guards', () => {
  it.each([-1, 1.5, 601])('rejects months %p', (n) => {
    expect(() => futureValuePath(m(1), percent('5'), n, m(1), ZERO_PERCENT)).toThrow(/^futureValuePath: /);
    expect(() => futureValueNet(m(1), percent('5'), n, m(1), ZERO_PERCENT)).toThrow(/^futureValueNet: /);
  });
  it('rejects negative monthly or seed', () => {
    expect(() => futureValuePath(m(-1), percent('5'), 1, m(0), ZERO_PERCENT)).toThrow(/^futureValuePath: /);
    expect(() => futureValuePath(m(0), percent('5'), 1, m(-1), ZERO_PERCENT)).toThrow(/^futureValuePath: /);
    expect(() => futureValueNet(m(-1), percent('5'), 1, m(0), ZERO_PERCENT)).toThrow(/^futureValueNet: /);
    expect(() => futureValueNet(m(0), percent('5'), 1, m(-1), ZERO_PERCENT)).toThrow(/^futureValueNet: /);
  });
  it('rejects a holding fee above 100%', () => {
    const fee = percentFromScaled(ONE_HUNDRED_PERCENT + 1n);
    expect(() => futureValueNet(m(1), percent('5'), 1, m(1), fee)).toThrow(/^futureValueNet: /);
    expect(() => futureValuePath(m(1), percent('5'), 1, m(1), fee)).toThrow(/^futureValuePath: /);
  });
  it('accepts a holding fee of exactly 100%', () => {
    const fee = percentFromScaled(ONE_HUNDRED_PERCENT);
    expect(futureValueNet(m(0), ZERO_PERCENT, 1, m(120_000), fee)).toBe(110_000);
  });
});

describe('properties', () => {
  const amt = fc.integer({ min: 0, max: 100_000_000 });
  const apr = fc.bigInt({ min: 0n, max: 30n * 10n ** 10n });
  const fee = fc.bigInt({ min: 0n, max: 5n * 10n ** 10n });
  const months = fc.integer({ min: 0, max: 120 });
  it('every index equals futureValue and the series is non-decreasing', () => {
    fc.assert(
      fc.property(amt, amt, apr, months, (mo, seed, a, n) => {
        const p = percentFromScaled(a);
        const path = futureValuePath(m(mo), p, n, m(seed), ZERO_PERCENT);
        expect(path).toHaveLength(n + 1);
        for (let i = 0; i <= n; i += 1) {
          expect(path[i]).toBe(futureValue(m(mo), p, i, m(seed)));
          if (i > 0) {
            expect(path[i]!).toBeGreaterThanOrEqual(path[i - 1]!);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
  it('the fee path equals futureValueNet at every month and the fee never helps', () => {
    fc.assert(
      fc.property(amt, amt, apr, fee, months, (mo, seed, a, f, n) => {
        const p = percentFromScaled(a);
        const fp = percentFromScaled(f);
        const path = futureValuePath(m(mo), p, n, m(seed), fp);
        for (let i = 0; i <= n; i += 1) {
          expect(path[i]).toBe(futureValueNet(m(mo), p, i, m(seed), fp));
        }
        expect(futureValueNet(m(mo), p, n, m(seed), fp)).toBeLessThanOrEqual(
          futureValueNet(m(mo), p, n, m(seed), ZERO_PERCENT)
        );
      }),
      { numRuns: 100 }
    );
  });
});
