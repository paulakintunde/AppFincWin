import {
  isValidLocalDate,
  isValidTimeZone,
  localDateIn,
  monthOf,
  monthRange,
} from '../localDate';

describe('isValidTimeZone', () => {
  it('accepts a real IANA zone', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
  });

  it('rejects a bogus zone', () => {
    expect(isValidTimeZone('Nope')).toBe(false);
  });
});

describe('localDateIn', () => {
  it('keeps a late-evening entry on its own local calendar day (America/Vancouver, PDT)', () => {
    // 2026-10-01T06:30:00Z is 2026-09-30T23:30:00-07:00 in America/Vancouver.
    expect(localDateIn(new Date('2026-10-01T06:30:00Z'), 'America/Vancouver')).toBe('2026-09-30');
  });

  it('rolls forward into the next local day for a zone ahead of UTC (Pacific/Auckland)', () => {
    expect(localDateIn(new Date('2026-09-30T12:30:00Z'), 'Pacific/Auckland')).toBe('2026-10-01');
  });

  it('is correct either side of the US spring-forward DST boundary (America/New_York)', () => {
    expect(localDateIn(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toBe('2026-03-08');
  });

  it('is correct either side of the US fall-back DST boundary (America/New_York)', () => {
    expect(localDateIn(new Date('2026-11-01T05:30:00Z'), 'America/New_York')).toBe('2026-11-01');
  });

  it('throws RangeError for an invalid time zone', () => {
    expect(() => localDateIn(new Date('2026-01-01T00:00:00Z'), 'Not/AZone')).toThrow(RangeError);
  });
});

describe('isValidLocalDate', () => {
  it('rejects a non-leap-year Feb 29', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false);
  });

  it('accepts a leap-year Feb 29', () => {
    expect(isValidLocalDate('2028-02-29')).toBe(true);
  });

  it('rejects a non-padded date string', () => {
    expect(isValidLocalDate('2026-9-1')).toBe(false);
  });

  it('rejects a month outside 01-12', () => {
    expect(isValidLocalDate('2026-13-01')).toBe(false);
  });

  it('rejects a day outside 01-31', () => {
    expect(isValidLocalDate('2026-01-32')).toBe(false);
  });
});

describe('monthOf', () => {
  it('derives the month from a local date string', () => {
    expect(monthOf(localDateIn(new Date('2026-10-01T06:30:00Z'), 'America/Vancouver'))).toBe('2026-09');
  });

  it('throws RangeError on an invalid local date', () => {
    expect(() => monthOf('2026-02-29')).toThrow(RangeError);
  });
});

describe('monthRange', () => {
  it('returns the start and exclusive end of a month, rolling into the next year', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });

  it('returns the start and exclusive end of a mid-year month', () => {
    expect(monthRange('2026-06')).toEqual({ start: '2026-06-01', endExclusive: '2026-07-01' });
  });

  it('throws RangeError on an invalid month', () => {
    expect(() => monthRange('2026-13')).toThrow(RangeError);
  });
});
