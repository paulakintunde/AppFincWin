import type { RecurringFreq } from '../../recurring/schedule';
import { minorUnits } from '../../money/types';
import {
  addDays,
  assertValidBill,
  billsDueWithin,
  isDeductedAheadFreq,
  isSmoothedFreq,
  isSmoothedPayFreq,
  monthlyEquivalent,
  nextDueDate,
  scheduledOutflowsDue,
} from '../series';
import { bill, outflow } from './helpers/fixtures';

const m = minorUnits;

describe('monthlyEquivalent (D-23, D-20)', () => {
  it.each([
    ['yearly', 120_000, 10_000],
    ['yearly', 100_001, 8_333],
    ['quarterly', 30_000, 10_000],
    ['quarterly', 10_001, 3_334],
    ['weekly', 1_000, 4_333],
    ['fortnightly', 1_000, 2_167],
    ['monthly', 12_345, 12_345],
  ] as const)('%s %i -> %i', (freq, amount, expected) => {
    expect(monthlyEquivalent(m(amount), freq)).toBe(expected);
  });

  it('is 0 for a 0 amount on every frequency', () => {
    for (const freq of ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'] as const) {
      expect(monthlyEquivalent(m(0), freq)).toBe(0);
    }
  });

  it('rejects an unknown frequency', () => {
    expect(() => monthlyEquivalent(m(1), 'daily' as RecurringFreq)).toThrow(/freq/);
  });
});

describe('frequency classes', () => {
  it('isSmoothedFreq is true for every non-monthly frequency (D-23)', () => {
    expect(isSmoothedFreq('weekly')).toBe(true);
    expect(isSmoothedFreq('fortnightly')).toBe(true);
    expect(isSmoothedFreq('quarterly')).toBe(true);
    expect(isSmoothedFreq('yearly')).toBe(true);
    expect(isSmoothedFreq('monthly')).toBe(false);
  });

  it('isSmoothedPayFreq is weekly and fortnightly only (D-60)', () => {
    expect(isSmoothedPayFreq('weekly')).toBe(true);
    expect(isSmoothedPayFreq('fortnightly')).toBe(true);
    expect(isSmoothedPayFreq('monthly')).toBe(false);
    expect(isSmoothedPayFreq('quarterly')).toBe(false);
    expect(isSmoothedPayFreq('yearly')).toBe(false);
  });

  it('isDeductedAheadFreq is quarterly and yearly only (D-24)', () => {
    expect(isDeductedAheadFreq('quarterly')).toBe(true);
    expect(isDeductedAheadFreq('yearly')).toBe(true);
    expect(isDeductedAheadFreq('monthly')).toBe(false);
    expect(isDeductedAheadFreq('fortnightly')).toBe(false);
    expect(isDeductedAheadFreq('weekly')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-07-10', 90)).toBe('2026-10-08');
    expect(addDays('2026-07-10', 0)).toBe('2026-07-10');
  });

  it('rejects a bad date or day count', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(/^addDays: /);
    expect(() => addDays('2026-01-01', -1)).toThrow(/^addDays: /);
    expect(() => addDays('2026-01-01', 1.5)).toThrow(/^addDays: /);
  });
});

describe('nextDueDate', () => {
  it('is the first occurrence after the last paid one', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      latestAmount: 1,
      lastPaidDate: '2025-09-01',
    });
    expect(nextDueDate(b)).toBe('2026-09-01');
  });

  it('is the anchor when nothing has been paid', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      latestAmount: 1,
    });
    expect(nextDueDate(b)).toBe('2025-09-01');
  });

  it('reuses month-end clamping', () => {
    const b = bill({
      seriesId: 's',
      freq: 'quarterly',
      anchorDate: '2026-01-31',
      latestAmount: 1,
      lastPaidDate: '2026-01-31',
    });
    expect(nextDueDate(b)).toBe('2026-04-30');
  });

  it('is null once the series has ended', () => {
    const byDate = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      latestAmount: 1,
      endDate: '2026-03-01',
      lastPaidDate: '2025-09-01',
    });
    expect(nextDueDate(byDate)).toBeNull();
    const byCount = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      latestAmount: 1,
      occurrenceCount: 1,
      lastPaidDate: '2025-09-01',
    });
    expect(nextDueDate(byCount)).toBeNull();
  });
});

describe('billsDueWithin (D-24, D-25, D-26)', () => {
  const asOf = '2026-07-10';

  it('returns an unpaid yearly bill inside the window', () => {
    const b = bill({
      seriesId: 'ins',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      lastPaidDate: '2025-09-01',
      latestAmount: 120_000,
      categoryId: 'c1',
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([
      {
        seriesId: 'ins',
        categoryId: 'c1',
        dates: ['2026-09-01'],
        amount: 120_000,
      },
    ]);
  });

  it('skips a bill already paid this cycle', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-07-05',
      lastPaidDate: '2026-07-05',
      latestAmount: 1_000,
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([]);
  });

  it('still owes an unpaid occurrence earlier in the check month', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-07-05',
      lastPaidDate: '2025-07-05',
      latestAmount: 1_000,
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([
      { seriesId: 's', categoryId: null, dates: ['2026-07-05'], amount: 1_000 },
    ]);
  });

  it('treats the horizon as inclusive', () => {
    const edge = bill({
      seriesId: 'a',
      freq: 'yearly',
      anchorDate: '2025-10-08',
      lastPaidDate: '2025-10-08',
      latestAmount: 5,
    });
    const past = bill({
      seriesId: 'b',
      freq: 'yearly',
      anchorDate: '2025-10-09',
      lastPaidDate: '2025-10-09',
      latestAmount: 5,
    });
    expect(billsDueWithin([edge, past], asOf, 90).map((d) => d.seriesId)).toEqual(['a']);
  });

  it('returns only occurrences inside the window for a quarterly bill', () => {
    const b = bill({
      seriesId: 'q',
      freq: 'quarterly',
      anchorDate: '2026-01-15',
      lastPaidDate: '2026-04-15',
      latestAmount: 30_000,
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([
      {
        seriesId: 'q',
        categoryId: null,
        dates: ['2026-07-15'],
        amount: 30_000,
      },
    ]);
  });

  it('multiplies the amount by the number of occurrences', () => {
    const b = bill({
      seriesId: 'q',
      freq: 'quarterly',
      anchorDate: '2026-04-01',
      latestAmount: 7_000,
    });
    expect(billsDueWithin([b], '2026-07-01', 92)).toEqual([
      {
        seriesId: 'q',
        categoryId: null,
        dates: ['2026-07-01', '2026-10-01'],
        amount: 14_000,
      },
    ]);
  });

  it('never returns monthly, weekly or fortnightly bills', () => {
    const bills = (['monthly', 'weekly', 'fortnightly'] as const).map((freq) =>
      bill({
        seriesId: freq,
        freq,
        anchorDate: '2026-07-11',
        latestAmount: 100,
      })
    );
    expect(billsDueWithin(bills, asOf, 90)).toEqual([]);
  });

  it('ignores unconfirmed series (D-25)', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2026-08-01',
      latestAmount: 100,
      confirmed: false,
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([]);
  });

  it('uses the latest amount (D-26)', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      lastPaidDate: '2025-09-01',
      latestAmount: 132_000,
    });
    expect(billsDueWithin([b], asOf, 90)[0]?.amount).toBe(132_000);
  });

  it('skips a bill with no occurrence in the window', () => {
    const b = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-01-01',
      lastPaidDate: '2026-01-01',
      latestAmount: 100,
    });
    expect(billsDueWithin([b], asOf, 90)).toEqual([]);
  });

  describe('guards', () => {
    const ok = bill({
      seriesId: 's',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      latestAmount: 100,
    });
    const bad = (over: object) => [{ ...ok, ...over }] as never;

    it('rejects malformed bills', () => {
      for (const over of [
        { freq: 'daily' },
        { anchorDate: '2026-02-30' },
        { lastPaidDate: '2026-13-01' },
        { endDate: 'nope' },
        { latestAmount: -1 },
        { latestAmount: 1.5 },
        { occurrenceCount: 0 },
        { occurrenceCount: 1.5 },
      ]) {
        expect(() => billsDueWithin(bad(over), asOf, 90)).toThrow(/^billsDueWithin: /);
      }
    });

    it('validates bills even when unconfirmed', () => {
      expect(() => billsDueWithin(bad({ confirmed: false, freq: 'daily' }), asOf, 90)).toThrow(RangeError);
    });

    it('rejects a bad asOf or horizon', () => {
      expect(() => billsDueWithin([ok], '2026-02-30', 90)).toThrow(/^billsDueWithin: /);
      expect(() => billsDueWithin([ok], asOf, -1)).toThrow(/^billsDueWithin: /);
      expect(() => billsDueWithin([ok], asOf, 1.5)).toThrow(/^billsDueWithin: /);
    });

    it('assertValidBill accepts a valid series and names the caller on failure', () => {
      expect(() => assertValidBill(ok, 'x')).not.toThrow();
      expect(() => assertValidBill({ ...ok, freq: 'daily' as never }, 'nextDueDate')).toThrow(/^nextDueDate: /);
    });
  });
});

describe('scheduledOutflowsDue (D-61)', () => {
  const asOf = '2026-07-10';

  it('is empty for no outflows', () => {
    expect(scheduledOutflowsDue([], asOf, 90)).toEqual({
      dueNow: 0,
      dueAhead: 0,
      dated: [],
    });
  });

  it('puts an outflow dated before or on asOf on day 0', () => {
    for (const date of ['2026-07-07', '2026-07-10', '2025-12-01']) {
      expect(scheduledOutflowsDue([outflow({ id: 'o', date, amount: 50_000 })], asOf, 90)).toEqual({
        dueNow: 50_000,
        dueAhead: 0,
        dated: [{ date: '2026-07-10', amount: 50_000 }],
      });
    }
  });

  it('keeps a later outflow on its own date', () => {
    expect(scheduledOutflowsDue([outflow({ id: 'o', date: '2026-07-30', amount: 30_000 })], asOf, 90)).toEqual({
      dueNow: 0,
      dueAhead: 30_000,
      dated: [{ date: '2026-07-30', amount: 30_000 }],
    });
  });

  it('includes asOf + 90 and leaves out asOf + 91', () => {
    expect(scheduledOutflowsDue([outflow({ id: 'o', date: '2026-10-08', amount: 20_000 })], asOf, 90)).toEqual({
      dueNow: 0,
      dueAhead: 20_000,
      dated: [{ date: '2026-10-08', amount: 20_000 }],
    });
    expect(scheduledOutflowsDue([outflow({ id: 'o', date: '2026-10-09', amount: 20_000 })], asOf, 90)).toEqual({
      dueNow: 0,
      dueAhead: 0,
      dated: [],
    });
  });

  it('sums the lot and keeps input order', () => {
    const result = scheduledOutflowsDue(
      [
        outflow({ id: 'a', date: '2026-07-30', amount: 30_000 }),
        outflow({ id: 'b', date: '2026-07-07', amount: 50_000 }),
        outflow({ id: 'c', date: '2026-10-09', amount: 99 }),
        outflow({ id: 'd', date: '2026-10-08', amount: 20_000 }),
        outflow({ id: 'e', date: '2026-07-10', amount: 1_000 }),
      ],
      asOf,
      90
    );
    expect(result.dueNow).toBe(51_000);
    expect(result.dueAhead).toBe(50_000);
    expect(result.dated).toEqual([
      { date: '2026-07-30', amount: 30_000 },
      { date: '2026-07-10', amount: 50_000 },
      { date: '2026-10-08', amount: 20_000 },
      { date: '2026-07-10', amount: 1_000 },
    ]);
  });

  it('rejects malformed input', () => {
    const good = outflow({ id: 'o', date: '2026-07-30', amount: 100 });
    for (const over of [{ amount: 0 }, { amount: -1 }, { amount: 1.5 }, { date: '2026-02-30' }]) {
      expect(() => scheduledOutflowsDue([{ ...good, ...over } as never], asOf, 90)).toThrow(/^scheduledOutflowsDue: /);
    }
    expect(() => scheduledOutflowsDue([good], '2026-02-30', 90)).toThrow(/^scheduledOutflowsDue: /);
    expect(() => scheduledOutflowsDue([good], asOf, -1)).toThrow(/^scheduledOutflowsDue: /);
    expect(() => scheduledOutflowsDue([good], asOf, 1.5)).toThrow(/^scheduledOutflowsDue: /);
  });
});
