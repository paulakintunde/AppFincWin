import { addDays, addMonthsClamped, daysBetween, daysInMonth, parseDate } from '../calendar';

describe('time/calendar', () => {
  it('clamps month ends and handles leap years', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('adds days across a year end, and backwards', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('parses a real date and rejects an impossible one', () => {
    expect(parseDate('2026-02-28')).toEqual({ y: 2026, m: 2, d: 28 });
    expect(() => parseDate('2026-02-30')).toThrow(RangeError);
  });

  it('rejects non-integer steps', () => {
    expect(() => addDays('2026-01-01', 1.5)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-01-01', 0.5)).toThrow(RangeError);
  });
});
