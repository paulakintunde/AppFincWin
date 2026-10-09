import { daysInMonth } from '../../recurring/schedule';
import { firstWeekdayOffset, weekOfMonth, weekRange, weeksInMonth } from '../weeks';

describe('weeks', () => {
  it('known October 2026 values (1 Oct is a Thursday)', () => {
    expect(firstWeekdayOffset('2026-10', 1)).toBe(3);
    expect(firstWeekdayOffset('2026-10', 0)).toBe(4);
    expect(weekOfMonth('2026-10', 1, 1)).toBe(1);
    expect(weekOfMonth('2026-10', 5, 1)).toBe(2);
    expect(weekRange('2026-10', 1, 1)).toEqual({ from: 1, to: 4 });
    expect(weekRange('2026-10', 2, 1)).toEqual({ from: 5, to: 11 });
  });

  it('can span six weeks', () => {
    // 1 Feb 2026 is a Sunday; with Sunday start Feb needs 4 weeks, but 1 Aug 2026 (Sat) needs 6.
    expect(weeksInMonth('2026-08', 0)).toBe(6);
    expect(weekRange('2026-08', 6, 0)).toEqual({ from: 30, to: 31 });
  });

  it('weeks cover every day exactly once for 1900-2100, both week starts', () => {
    for (let year = 1900; year <= 2100; year++) {
      for (let mon = 1; mon <= 12; mon++) {
        const month = `${year}-${String(mon).padStart(2, '0')}`;
        const dim = daysInMonth(year, mon);
        for (const ws of [0, 1] as const) {
          const n = weeksInMonth(month, ws);
          expect(n).toBeLessThanOrEqual(6);
          let expected = 1;
          for (let w = 1; w <= n; w++) {
            const { from, to } = weekRange(month, w, ws);
            expect(from).toBe(expected);
            expect(to).toBeGreaterThanOrEqual(from);
            expect(to).toBeLessThanOrEqual(dim);
            for (let d = from; d <= to; d++) expect(weekOfMonth(month, d, ws)).toBe(w);
            expected = to + 1;
          }
          expect(expected).toBe(dim + 1);
        }
      }
    }
  });

  it('throws RangeError on invalid input', () => {
    expect(() => firstWeekdayOffset('2026-13', 1)).toThrow(RangeError);
    expect(() => firstWeekdayOffset('bad', 1)).toThrow(RangeError);
    expect(() => weekOfMonth('2026-10', 0, 1)).toThrow(RangeError);
    expect(() => weekOfMonth('2026-10', 32, 1)).toThrow(RangeError);
    expect(() => weekOfMonth('2026-10', 1.5, 1)).toThrow(RangeError);
    expect(() => weekRange('2026-10', 0, 1)).toThrow(RangeError);
    expect(() => weekRange('2026-10', 7, 1)).toThrow(RangeError);
    expect(() => weekRange('2026-10', 1.5, 1)).toThrow(RangeError);
  });
});
