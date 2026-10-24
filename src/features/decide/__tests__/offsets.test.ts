import { OFFSETS, awayFrom, isPastDate, offsetDate } from '../offsets';

describe('offsets', () => {
  it('lists keys in order', () => {
    expect(OFFSETS.map((o) => o.key)).toEqual(['inWeek', 'inMonth', 'in3Months']);
  });
  it('clamps to month end', () => {
    expect(offsetDate('2026-01-31', 'inMonth')).toBe('2026-02-28');
    expect(offsetDate('2028-01-31', 'inMonth')).toBe('2028-02-29');
    expect(offsetDate('2026-11-30', 'in3Months')).toBe('2027-02-28');
    expect(offsetDate('2026-10-15', 'inWeek')).toBe('2026-10-22');
  });
  it('isPastDate', () => {
    expect(isPastDate('2026-10-14', '2026-10-15')).toBe(true);
    expect(isPastDate('2026-10-15', '2026-10-15')).toBe(false);
  });
  it('awayFrom', () => {
    const t = '2026-10-15';
    expect(awayFrom(t, t)).toEqual({ key: 'today' });
    expect(awayFrom(t, '2026-10-16')).toEqual({ key: 'tomorrow' });
    expect(awayFrom(t, '2026-10-22')).toEqual({ key: 'days', count: 7 });
    expect(awayFrom(t, '2026-11-14')).toEqual({ key: 'days', count: 30 });
    expect(awayFrom(t, '2026-11-15')).toEqual({ key: 'months', count: 1 });
    expect(awayFrom(t, '2026-11-20')).toEqual({ key: 'months', count: 1 });
    expect(awayFrom(t, '2027-01-14')).toEqual({ key: 'months', count: 2 });
    expect(awayFrom(t, '2027-01-15')).toEqual({ key: 'months', count: 3 });
    expect(awayFrom('2026-01-31', '2026-03-03')).toEqual({ key: 'months', count: 1 });
  });
});
