import { fullMonthFlags, shiftMonth } from '../fullMonths';

const rows = (...dates: string[]) => dates.map((date) => ({ date, accountId: 'a1' }));
const base = { today: '2026-10-15', periods: [], lookbackMonths: 12 };

describe('fullMonthFlags', () => {
  it('returns an entry for each lookback month plus the current month', () => {
    const flags = fullMonthFlags({ ...base, rowDates: rows('2026-05-01') });
    expect(flags.size).toBe(13);
    expect([...flags.keys()][0]).toBe('2025-10');
    expect([...flags.keys()][12]).toBe('2026-10');
  });

  it('never marks the current month full', () => {
    const flags = fullMonthFlags({ ...base, rowDates: rows('2026-05-01', '2026-10-02') });
    expect(flags.get('2026-10')).toBe(false);
  });

  it('a month with no live rows is not full', () => {
    const flags = fullMonthFlags({ ...base, rowDates: rows('2026-05-01', '2026-07-09') });
    expect(flags.get('2026-06')).toBe(false);
    expect(flags.get('2026-07')).toBe(true);
  });

  it('an earliest row on the 1st makes that month full', () => {
    const flags = fullMonthFlags({ ...base, rowDates: rows('2026-05-01', '2026-06-20') });
    expect(flags.get('2026-05')).toBe(true);
    expect(flags.get('2026-04')).toBe(false);
  });

  it('an earliest row after the 1st leaves its month partial and the next month full', () => {
    const flags = fullMonthFlags({ ...base, rowDates: rows('2026-05-03', '2026-05-20', '2026-06-04') });
    expect(flags.get('2026-05')).toBe(false);
    expect(flags.get('2026-06')).toBe(true);
  });

  it('a statement period covering the month end to end makes it full', () => {
    const flags = fullMonthFlags({
      ...base,
      rowDates: rows('2026-04-03', '2026-06-04'),
      periods: [{ accountId: 'a2', start: '2026-04-01', end: '2026-04-30' }],
    });
    expect(flags.get('2026-04')).toBe(true);
    expect(flags.get('2026-05')).toBe(false);
  });

  it('a period that starts on the 2nd does not cover the month', () => {
    const flags = fullMonthFlags({
      ...base,
      rowDates: rows('2026-04-03'),
      periods: [{ accountId: 'a1', start: '2026-04-02', end: '2026-04-30' }],
    });
    expect(flags.get('2026-04')).toBe(false);
  });

  it('a period that ends before the last day does not cover the month', () => {
    const flags = fullMonthFlags({
      ...base,
      rowDates: rows('2026-02-03'),
      periods: [{ accountId: 'a1', start: '2026-02-01', end: '2026-02-27' }],
    });
    expect(flags.get('2026-02')).toBe(false);
    const leap = fullMonthFlags({
      today: '2024-06-10',
      periods: [{ accountId: 'a1', start: '2024-02-01', end: '2024-02-29' }],
      lookbackMonths: 6,
      rowDates: rows('2024-02-03'),
    });
    expect(leap.get('2024-02')).toBe(true);
  });

  it('no rows at all means no month is full', () => {
    const flags = fullMonthFlags({ ...base, rowDates: [] });
    expect([...flags.values()].some(Boolean)).toBe(false);
  });

  it('shiftMonth crosses year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
