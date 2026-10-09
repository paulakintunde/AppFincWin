import { regionWeekStart } from '../regionWeekStart';

describe('regionWeekStart', () => {
  it('maps regions to Sunday or Monday', () => {
    expect(regionWeekStart('US')).toBe(0);
    expect(regionWeekStart('gb')).toBe(1);
    expect(regionWeekStart(' de ')).toBe(1);
  });
  it('returns undefined for unlisted or empty regions', () => {
    expect(regionWeekStart('ZZ')).toBeUndefined();
    expect(regionWeekStart(null)).toBeUndefined();
    expect(regionWeekStart(undefined)).toBeUndefined();
    expect(regionWeekStart('')).toBeUndefined();
  });
});
