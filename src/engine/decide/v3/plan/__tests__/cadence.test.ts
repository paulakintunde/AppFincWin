import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import {
  BIWEEKLY,
  MONTHLY,
  QUARTERLY,
  WEEKLY,
  YEARLY,
  assertCadence,
  cadenceOfFreq,
  countFromTerm,
  monthlyEquivalentOf,
  perYear,
  sameCadence,
} from '../cadence';
import type { Cadence } from '../../types';

const cadenceArb = fc.record({
  unit: fc.constantFrom('week' as const, 'month' as const),
  every: fc.integer({ min: 1, max: 12 }),
});

describe('cadence', () => {
  it('I37 monthly equivalent within one minor unit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000 }), cadenceArb, (payment, c) => {
        const me = BigInt(monthlyEquivalentOf(minorUnits(payment), c));
        const { num } = perYear(c);
        const diff = 12n * me * BigInt(c.every) - BigInt(payment) * BigInt(num);
        const abs = diff < 0n ? -diff : diff;
        expect(abs <= 6n * BigInt(c.every)).toBe(true);
      }),
      { numRuns: 150 }
    );
  });

  it('D-01 named cadences', () => {
    expect(perYear(WEEKLY)).toEqual({ num: 52, den: 1 });
    expect(perYear(BIWEEKLY)).toEqual({ num: 52, den: 2 });
    expect(perYear(MONTHLY)).toEqual({ num: 12, den: 1 });
    expect(perYear(QUARTERLY)).toEqual({ num: 12, den: 3 });
    expect(perYear(YEARLY)).toEqual({ num: 12, den: 12 });
    expect(WEEKLY).toEqual({ unit: 'week', every: 1 });
    expect(YEARLY).toEqual({ unit: 'month', every: 12 });
  });

  it('D-19 every 4 weeks is 13 a year', () => {
    expect(perYear({ unit: 'week', every: 4 })).toEqual({ num: 52, den: 4 });
  });

  it('countFromTerm', () => {
    expect(countFromTerm(BIWEEKLY, 12)).toBe(26);
    expect(countFromTerm(QUARTERLY, 12)).toBe(4);
    expect(countFromTerm(YEARLY, 1)).toBe(1);
    expect(countFromTerm(MONTHLY, 0)).toBe(1);
  });

  it('cadenceOfFreq maps the five frequencies', () => {
    expect(cadenceOfFreq('weekly')).toEqual(WEEKLY);
    expect(cadenceOfFreq('fortnightly')).toEqual(BIWEEKLY);
    expect(cadenceOfFreq('monthly')).toEqual(MONTHLY);
    expect(cadenceOfFreq('quarterly')).toEqual(QUARTERLY);
    expect(cadenceOfFreq('yearly')).toEqual(YEARLY);
    expect(sameCadence(MONTHLY, { unit: 'month', every: 1 })).toBe(true);
    expect(sameCadence(MONTHLY, WEEKLY)).toBe(false);
  });

  it('assertCadence throws on every 0, 13 or non-integer', () => {
    const bad = (every: number): Cadence => ({ unit: 'week', every });
    expect(() => assertCadence(bad(0), 't')).toThrow(RangeError);
    expect(() => assertCadence(bad(13), 't')).toThrow(RangeError);
    expect(() => assertCadence(bad(1.5), 't')).toThrow(RangeError);
    expect(() => assertCadence(bad(12), 't')).not.toThrow();
  });
});
