import fc from 'fast-check';
import { futureValue } from '../futureValue';
import { ZERO_PERCENT, percent, percentFromScaled } from '../types';
import { minorUnits } from '../../money/types';

const m = minorUnits;

describe('futureValue known values', () => {
  it('monthly only', () => {
    expect(futureValue(m(10_000), percent('12'), 12, m(0))).toBe(126_825);
  });
  it('seed only', () => {
    expect(futureValue(m(0), percent('12'), 12, m(100_000))).toBe(112_683);
  });
  it('both, single rounding', () => {
    expect(futureValue(m(10_000), percent('12'), 12, m(100_000))).toBe(239_508);
  });
  it('zero rate', () => {
    expect(futureValue(m(25_000), ZERO_PERCENT, 24, m(50_000))).toBe(650_000);
  });
  it('zero months', () => {
    expect(futureValue(m(10_000), percent('6.5'), 0, m(70_000))).toBe(70_000);
  });
});

describe('futureValue guards', () => {
  it.each([-1, 1.5, 601])('rejects months %p', (n) => {
    expect(() => futureValue(m(1), percent('5'), n, m(1))).toThrow(/^futureValue: /);
  });
  it('rejects negative monthly or seed', () => {
    expect(() => futureValue(m(-1), percent('5'), 1, m(0))).toThrow(RangeError);
    expect(() => futureValue(m(0), percent('5'), 1, m(-1))).toThrow(RangeError);
  });
});

describe('futureValue properties', () => {
  const amt = fc.integer({ min: 0, max: 10_000_000 });
  const apr = fc.bigInt({ min: 0n, max: 100_000_000_000n }); // <= 10%: keeps 600-month growth inside the safe-integer range
  it('never loses money and grows with months', () => {
    fc.assert(
      fc.property(amt, amt, apr, fc.integer({ min: 0, max: 599 }), (mo, seed, a, n) => {
        const p = percentFromScaled(a);
        const fv = futureValue(m(mo), p, n, m(seed));
        expect(fv).toBeGreaterThanOrEqual(seed + mo * n);
        expect(futureValue(m(mo), p, n + 1, m(seed))).toBeGreaterThanOrEqual(fv);
      }),
      { numRuns: 100 }
    );
  });
});
