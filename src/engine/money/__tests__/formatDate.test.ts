import { formatLocalDate } from '../formatDate';

describe('formatLocalDate: locale rendering', () => {
  it('formats en-US medium (default style)', () => {
    expect(formatLocalDate('2026-09-30', 'en-US', 'medium')).toBe('Sep 30, 2026');
  });

  it('defaults to medium style when none is given', () => {
    expect(formatLocalDate('2026-09-30', 'en-US')).toBe('Sep 30, 2026');
  });

  it('formats en-GB short as DD/MM/YYYY', () => {
    expect(formatLocalDate('2026-09-30', 'en-GB', 'short')).toBe('30/09/2026');
  });

  it('formats de-DE short as DD.MM.YY', () => {
    expect(formatLocalDate('2026-09-30', 'de-DE', 'short')).toBe('30.09.26');
  });

  it('formats en-US long', () => {
    expect(formatLocalDate('2026-09-30', 'en-US', 'long')).toBe('September 30, 2026');
  });
});

describe('formatLocalDate: MON-14 -- never shifts the day, regardless of device time zone', () => {
  it('does not shift the day at a DST spring-forward boundary', () => {
    const expected = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(
      Date.UTC(2026, 2, 8)
    );
    expect(formatLocalDate('2026-03-08', 'en-US', 'short')).toBe(expected);
  });

  it('does not shift the day at a DST fall-back boundary', () => {
    const expected = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(
      Date.UTC(2026, 10, 1)
    );
    expect(formatLocalDate('2026-11-01', 'en-US', 'short')).toBe(expected);
  });
});

describe('formatLocalDate: rejections', () => {
  it('throws RangeError for an out-of-range month', () => {
    expect(() => formatLocalDate('2026-13-01', 'en-US')).toThrow(RangeError);
  });

  it('throws RangeError for a day that does not exist in the given month', () => {
    expect(() => formatLocalDate('2026-02-30', 'en-US')).toThrow(RangeError);
  });

  it('throws RangeError for a string that is not shaped like a date at all', () => {
    expect(() => formatLocalDate('not-a-date', 'en-US')).toThrow(RangeError);
  });
});
