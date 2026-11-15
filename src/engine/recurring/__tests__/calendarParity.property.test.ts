// 05.5-10: the one calendar (time/calendar + v3 cadence dates) agrees with the SQL-mirrored schedule.ts.
import fc from 'fast-check';
import { cadenceDatesBetween } from '../../decide/v3/dates';
import { cadenceOfFreq } from '../../decide/v3/plan/cadence';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { addDays, daysInMonth } from '../../time/calendar';
import { daysInMonth as scheduleDaysInMonth, occurrencesBetween, RECURRING_FREQS } from '../schedule';

const dateArb = fc
  .tuple(fc.integer({ min: 2020, max: 2035 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
  .map(([y, m, d]) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, scheduleDaysInMonth(y, m))).padStart(2, '0')}`);

describe('calendar parity with recurring/schedule', () => {
  it('cadenceDatesBetween equals occurrencesBetween for every frequency', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RECURRING_FREQS), dateArb, dateArb, dateArb, (freq, anchor, a, b) => {
        const from = a <= b ? a : b;
        const to = a <= b ? b : a;
        const v3 = cadenceDatesBetween(anchor, cadenceOfFreq(freq), from, addDays(to, 1), null);
        const sched = occurrencesBetween(
          { anchorDate: anchor, freq, endDate: null, occurrenceCount: null },
          from,
          to
        ).map((o) => o.date);
        expect(v3).toEqual(sched);
      }),
      { numRuns: fcRuns(200), seed: 0x0a10 }
    );
  });

  it('daysInMonth agrees for every month 1990..2100', () => {
    for (let y = 1990; y <= 2100; y++) {
      for (let m = 1; m <= 12; m++) expect(daysInMonth(y, m)).toBe(scheduleDaysInMonth(y, m));
    }
  });
});
