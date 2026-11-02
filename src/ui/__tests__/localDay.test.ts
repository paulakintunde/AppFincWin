import { localDayOf } from '../localDay';

describe('localDayOf', () => {
  it('converts an instant to the zone day', () => {
    expect(localDayOf('2026-11-01T02:30:00Z', 'America/Vancouver')).toBe('2026-10-31');
    expect(localDayOf('2026-11-01T02:30:00Z', 'UTC')).toBe('2026-11-01');
    expect(localDayOf('2026-10-31T23:30:00Z', 'Asia/Tokyo')).toBe('2026-11-01');
  });
  it('returns a bare date unchanged', () => {
    expect(localDayOf('2026-10-31', 'Asia/Tokyo')).toBe('2026-10-31');
  });
  it('returns null for empty, garbage and missing values', () => {
    expect(localDayOf('', 'UTC')).toBeNull();
    expect(localDayOf('nope', 'UTC')).toBeNull();
    expect(localDayOf(null, 'UTC')).toBeNull();
    expect(localDayOf(undefined, 'UTC')).toBeNull();
  });
  it('returns null for an invalid zone', () => {
    expect(localDayOf('2026-11-01T02:30:00Z', 'Not/AZone')).toBeNull();
  });
});
