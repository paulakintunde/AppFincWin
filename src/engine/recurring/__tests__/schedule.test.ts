import fc from 'fast-check';
import fixtures from '../../../../supabase/tests/fixtures/recurring-schedule-cases.json';
import { isValidLocalDate } from '../../time/localDate';
import {
  daysInMonth,
  isRecurringFreq,
  materialisationHorizon,
  MAX_OCCURRENCES_PER_CALL,
  occurrenceDate,
  occurrencesBetween,
  projectOccurrences,
  RECURRING_FREQS,
  type RecurringFreq,
  type RecurringSchedule,
  // Imported via the barrel (not '../schedule' directly) so `index.ts`'s
  // re-export statement is exercised too -- it has no logic of its own to
  // test, only coverage to earn, exactly like every other engine/ barrel.
} from '../index';

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
}

describe('occurrenceDate', () => {
  it.each(fixtures.occurrence)(
    '$freq anchor=$anchor n=$n -> $expected',
    ({ anchor, freq, n, expected }) => {
      expect(occurrenceDate(anchor, freq as RecurringFreq, n)).toBe(expected);
    }
  );

  it('returns the anchor unchanged for n = 0', () => {
    expect(occurrenceDate('2026-05-15', 'monthly', 0)).toBe('2026-05-15');
  });

  it('throws RangeError for a negative n', () => {
    expect(() => occurrenceDate('2026-05-15', 'monthly', -1)).toThrow(RangeError);
  });

  it('throws RangeError for a non-integer n', () => {
    expect(() => occurrenceDate('2026-05-15', 'monthly', 1.5)).toThrow(RangeError);
  });

  it('throws RangeError for an unknown freq', () => {
    expect(() => occurrenceDate('2026-05-15', 'bogus' as RecurringFreq, 1)).toThrow(RangeError);
  });

  it('throws RangeError for an invalid anchor date', () => {
    expect(() => occurrenceDate('2026-02-30', 'monthly', 1)).toThrow(RangeError);
  });
});

describe('isRecurringFreq', () => {
  it.each(RECURRING_FREQS)('accepts %s', (freq) => {
    expect(isRecurringFreq(freq)).toBe(true);
  });

  it('rejects an unknown string', () => {
    expect(isRecurringFreq('bogus')).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('returns 29 for February in a leap year', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it('returns 28 for February in a non-leap year', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('returns 28 for February in a non-leap century year', () => {
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  it('returns 31 for January', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it('returns 30 for April', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('materialisationHorizon', () => {
  it.each(fixtures.horizon)('today=$today -> $expected', ({ today, expected }) => {
    expect(materialisationHorizon(today)).toBe(expected);
  });

  it('throws RangeError for an invalid today', () => {
    expect(() => materialisationHorizon('2026-02-30')).toThrow(RangeError);
  });
});

describe('occurrencesBetween', () => {
  const monthlySchedule: RecurringSchedule = {
    anchorDate: '2026-01-01',
    freq: 'monthly',
    endDate: null,
    occurrenceCount: null,
  };

  it('returns every occurrence between from and to inclusive, n ascending', () => {
    const results = occurrencesBetween(monthlySchedule, '2026-01-01', '2026-04-01');
    expect(results).toEqual([
      { n: 0, date: '2026-01-01' },
      { n: 1, date: '2026-02-01' },
      { n: 2, date: '2026-03-01' },
      { n: 3, date: '2026-04-01' },
    ]);
  });

  it('honours an end date, stopping at (and including) it', () => {
    const schedule: RecurringSchedule = { ...monthlySchedule, endDate: '2026-03-01' };
    const results = occurrencesBetween(schedule, '2026-01-01', '2026-12-31');
    expect(results.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('honours an occurrence count, n < count only', () => {
    const schedule: RecurringSchedule = { ...monthlySchedule, occurrenceCount: 3 };
    const results = occurrencesBetween(schedule, '2026-01-01', '2026-12-31');
    expect(results.map((r) => r.n)).toEqual([0, 1, 2]);
  });

  it('when both an end date and an occurrence count are set, the earlier limit wins (count first)', () => {
    const schedule: RecurringSchedule = {
      ...monthlySchedule,
      endDate: '2026-12-31',
      occurrenceCount: 2,
    };
    const results = occurrencesBetween(schedule, '2026-01-01', '2026-12-31');
    expect(results.map((r) => r.n)).toEqual([0, 1]);
  });

  it('when both are set, the earlier limit wins (end date first)', () => {
    const schedule: RecurringSchedule = {
      ...monthlySchedule,
      endDate: '2026-02-01',
      occurrenceCount: 100,
    };
    const results = occurrencesBetween(schedule, '2026-01-01', '2026-12-31');
    expect(results.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('returns an empty array when from is after to', () => {
    expect(occurrencesBetween(monthlySchedule, '2026-12-31', '2026-01-01')).toEqual([]);
  });

  it('throws RangeError for an invalid fromInclusive date', () => {
    expect(() => occurrencesBetween(monthlySchedule, '2026-02-30', '2026-12-31')).toThrow(RangeError);
  });

  it('throws RangeError for an invalid toInclusive date', () => {
    expect(() => occurrencesBetween(monthlySchedule, '2026-01-01', '2026-02-30')).toThrow(RangeError);
  });

  it('skips dates before fromInclusive without iterating from the anchor', () => {
    const results = occurrencesBetween(monthlySchedule, '2030-01-01', '2030-03-01');
    expect(results.map((r) => r.date)).toEqual(['2030-01-01', '2030-02-01', '2030-03-01']);
  });

  it('never returns more than MAX_OCCURRENCES_PER_CALL results', () => {
    const weekly: RecurringSchedule = {
      anchorDate: '2000-01-01',
      freq: 'weekly',
      endDate: null,
      occurrenceCount: null,
    };
    const results = occurrencesBetween(weekly, '2000-01-01', '2100-01-01');
    expect(results.length).toBe(MAX_OCCURRENCES_PER_CALL);
  });
});

describe('projectOccurrences', () => {
  const monthlySchedule: RecurringSchedule = {
    anchorDate: '2026-01-15',
    freq: 'monthly',
    endDate: null,
    occurrenceCount: null,
  };

  it('returns dates inside the month, with no lower bound', () => {
    expect(projectOccurrences(monthlySchedule, '2026-05', null)).toEqual(['2026-05-15']);
  });

  it('filters to dates strictly after afterExclusive', () => {
    expect(projectOccurrences(monthlySchedule, '2026-05', '2026-05-15')).toEqual([]);
  });

  it('includes a date when afterExclusive is earlier than it', () => {
    expect(projectOccurrences(monthlySchedule, '2026-05', '2026-05-01')).toEqual(['2026-05-15']);
  });

  it('returns an empty array for a month the schedule never touches', () => {
    const weekly: RecurringSchedule = {
      anchorDate: '2026-01-01',
      freq: 'yearly',
      endDate: null,
      occurrenceCount: null,
    };
    expect(projectOccurrences(weekly, '2026-06', null)).toEqual([]);
  });

  it('throws RangeError for an unparseable month', () => {
    expect(() => projectOccurrences(monthlySchedule, '2026-13', null)).toThrow(RangeError);
  });
});

describe('properties', () => {
  it('property: monthly/quarterly/yearly occurrences never exceed the month\'s last day and equal min(anchorDay, daysInMonth)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.constantFrom<RecurringFreq>('monthly', 'quarterly', 'yearly'),
        fc.integer({ min: 0, max: 200 }),
        (year, month, day, freq, n) => {
          const anchor = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const result = occurrenceDate(anchor, freq, n);
          const [ry, rm] = result.split('-').map(Number) as [number, number];
          const rd = Number(result.slice(8, 10));
          const maxDay = daysInMonth(ry, rm);
          expect(rd).toBeLessThanOrEqual(maxDay);
          expect(rd).toBe(Math.min(day, maxDay));
        }
      )
    );
  });

  it('property: weekly occurrence n and n+1 are exactly 7 days apart (fortnightly 14)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.constantFrom<RecurringFreq>('weekly', 'fortnightly'),
        fc.integer({ min: 0, max: 200 }),
        (year, month, day, freq, n) => {
          const anchor = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const a = occurrenceDate(anchor, freq, n);
          const b = occurrenceDate(anchor, freq, n + 1);
          expect(daysBetween(a, b)).toBe(freq === 'weekly' ? 7 : 14);
        }
      )
    );
  });

  it('property: occurrencesBetween is strictly ascending and every date is a valid local date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.constantFrom<RecurringFreq>('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'),
        fc.integer({ min: 2020, max: 2035 }),
        (year, month, day, freq, toYear) => {
          const anchor = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const schedule: RecurringSchedule = { anchorDate: anchor, freq, endDate: null, occurrenceCount: null };
          const results = occurrencesBetween(schedule, anchor, `${toYear}-12-31`);
          for (let i = 0; i < results.length; i += 1) {
            const entry = results[i]!;
            expect(entry.n).toBe(i);
            expect(isValidLocalDate(entry.date)).toBe(true);
            if (i > 0) {
              expect(entry.date > results[i - 1]!.date).toBe(true);
            }
          }
        }
      )
    );
  });

  it('property: results are identical whatever process.env.TZ is set to', () => {
    const originalTz = process.env.TZ;
    const cases: Array<[string, RecurringFreq, number]> = [
      ['2026-01-31', 'monthly', 1],
      ['2026-03-26', 'weekly', 5],
      ['2024-02-29', 'yearly', 3],
      ['2026-11-30', 'quarterly', 2],
    ];
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const first = cases.map(([anchor, freq, n]) => occurrenceDate(anchor, freq, n));
      process.env.TZ = 'America/Los_Angeles';
      const second = cases.map(([anchor, freq, n]) => occurrenceDate(anchor, freq, n));
      expect(second).toEqual(first);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
