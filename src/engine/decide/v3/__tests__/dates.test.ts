import fc from 'fast-check';
import { occurrenceDate, type RecurringFreq } from '../../../recurring/schedule';
import {
  addDays,
  addYearMonths,
  cadenceDate,
  cadenceDatesBetween,
  daysBetween,
  daysInYearMonth,
  yearMonthOf,
} from '../dates';

const anchorArb = fc
  .tuple(fc.integer({ min: 2000, max: 2060 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
  .map(([y, m, d]) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  });

const EQUIV: ReadonlyArray<readonly [string, 'week' | 'month', number, RecurringFreq]> = [
  ['every 1 week equals weekly', 'week', 1, 'weekly'],
  ['every 2 weeks equals fortnightly', 'week', 2, 'fortnightly'],
  ['every 1 month equals monthly', 'month', 1, 'monthly'],
  ['every 3 months equals quarterly', 'month', 3, 'quarterly'],
  ['every 12 months equals yearly', 'month', 12, 'yearly'],
];

describe('v3 dates', () => {
  it.each(EQUIV)('D-19 %s', (_name, unit, every, freq) => {
    fc.assert(
      fc.property(anchorArb, fc.integer({ min: 0, max: 200 }), (anchor, n) => {
        expect(cadenceDate(anchor, { unit, every }, n)).toBe(occurrenceDate(anchor, freq, n));
      }),
      { numRuns: 150 }
    );
  });

  it('every 4 weeks is 13 a year', () => {
    const dates = cadenceDatesBetween('2026-01-01', { unit: 'week', every: 4 }, '2026-01-01', '2026-12-31', null);
    expect(dates).toHaveLength(13);
  });

  it('month-end clamp never drifts', () => {
    const c = { unit: 'month', every: 1 } as const;
    expect([1, 2, 3].map((n) => cadenceDate('2026-01-31', c, n))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('endDate is inclusive and a reversed window is empty', () => {
    const c = { unit: 'week', every: 1 } as const;
    const dates = cadenceDatesBetween('2026-01-01', c, '2026-01-01', '2026-03-01', '2026-01-15');
    expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(cadenceDatesBetween('2026-01-01', c, '2026-03-01', '2026-01-01', null)).toEqual([]);
  });

  it('day and month arithmetic', () => {
    expect(daysBetween('2026-01-15', '2026-02-01')).toBe(17);
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(yearMonthOf('2026-07-09')).toBe('2026-07');
    expect(addYearMonths('2026-03', -4)).toBe('2025-11');
    expect(addYearMonths('2026-03', 13)).toBe('2027-04');
    expect(daysInYearMonth('2028-02')).toBe(29);
  });

  it('rejects bad input', () => {
    expect(() => cadenceDate('2026-02-30', { unit: 'week', every: 1 }, 0)).toThrow(RangeError);
    expect(() => cadenceDate('2026-01-01', { unit: 'week', every: 0 }, 0)).toThrow(RangeError);
    expect(() => cadenceDate('2026-01-01', { unit: 'week', every: 13 }, 0)).toThrow(RangeError);
    expect(() => cadenceDate('2026-01-01', { unit: 'week', every: 1 }, -1)).toThrow(RangeError);
    expect(() =>
      cadenceDatesBetween('2026-01-01', { unit: 'week', every: 1 }, '2026-01-01', '2056-01-01', null)
    ).toThrow(RangeError);
  });
});
