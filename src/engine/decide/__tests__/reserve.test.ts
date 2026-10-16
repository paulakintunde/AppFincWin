import fc from 'fast-check';
import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';
import { defaultReserve, reserveHalfMonthsFor } from '../reserve';
import type { Steadiness } from '../types';

const ALL: Steadiness[] = ['steady', 'variable', 'volatile', 'insufficient'];

describe('reserveHalfMonthsFor', () => {
  it.each([
    ['steady', 6],
    ['variable', 9],
    ['volatile', 12],
    ['insufficient', 6],
  ] as const)('%s reads %i half-months', (s, n) => {
    expect(reserveHalfMonthsFor(s)).toBe(n);
  });
});

describe('defaultReserve', () => {
  it('scales a month of costs by steadiness', () => {
    expect(defaultReserve(minorUnits(410_000), 'steady')).toBe(1_230_000);
    expect(defaultReserve(minorUnits(410_000), 'variable')).toBe(1_845_000);
    expect(defaultReserve(minorUnits(410_000), 'volatile')).toBe(2_460_000);
    expect(defaultReserve(minorUnits(410_000), 'insufficient')).toBe(1_230_000);
  });

  it('rounds an odd figure once, half-up', () => {
    expect(defaultReserve(minorUnits(410_001), 'variable')).toBe(1_845_005);
  });

  it('is zero for zero costs', () => {
    for (const s of ALL) expect(defaultReserve(minorUnits(0), s)).toBe(0);
  });

  it('rejects negative or fractional costs', () => {
    expect(() => defaultReserve(-1 as never, 'steady')).toThrow(/^defaultReserve: /);
    expect(() => defaultReserve(1.5 as never, 'steady')).toThrow(/^defaultReserve: /);
  });

  it('matches divideHalfUp and never shrinks as income gets less steady', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000 }), (c) => {
        const out = ALL.map((s) => defaultReserve(minorUnits(c), s));
        ALL.forEach((s, i) => {
          expect(BigInt(out[i]!)).toBe(divideHalfUp(BigInt(c) * BigInt(reserveHalfMonthsFor(s)), 2n));
        });
        expect(out[0]!).toBeLessThanOrEqual(out[1]!);
        expect(out[1]!).toBeLessThanOrEqual(out[2]!);
      })
    );
  });
});
