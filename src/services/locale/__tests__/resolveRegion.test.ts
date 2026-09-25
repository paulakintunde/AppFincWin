import { resolveRegion } from '../resolveRegion';

describe('resolveRegion (RD-02)', () => {
  it('an explicit override wins over both the device region and the time zone', () => {
    expect(resolveRegion({ override: 'US', deviceRegion: 'DE', timeZone: 'Europe/Berlin' })).toBe('US');
  });

  it('lower-case and whitespace in the override are normalized', () => {
    expect(resolveRegion({ override: ' us ', deviceRegion: 'DE' })).toBe('US');
  });

  it('an invalid override (not exactly two letters) is ignored', () => {
    expect(resolveRegion({ override: 'USA', deviceRegion: 'DE' })).toBe('DE');
    expect(resolveRegion({ override: '', deviceRegion: 'DE' })).toBe('DE');
    expect(resolveRegion({ override: '1', deviceRegion: 'DE' })).toBe('DE');
  });

  it('with no override, the device region wins over the time zone tiebreak', () => {
    expect(resolveRegion({ deviceRegion: 'DE', timeZone: 'America/Vancouver' })).toBe('DE');
  });

  it('the time zone tiebreak only applies when the device reports no region at all', () => {
    expect(resolveRegion({ deviceRegion: null, timeZone: 'America/Vancouver' })).toBe('CA');
    expect(resolveRegion({ deviceRegion: undefined, timeZone: 'Europe/Berlin' })).toBe('DE');
  });

  it('an unmapped time zone with no device region resolves to no region at all', () => {
    expect(resolveRegion({ deviceRegion: null, timeZone: 'Pacific/Kiritimati' })).toBeUndefined();
  });

  it('no override, no device region, no time zone: no region at all', () => {
    expect(resolveRegion({})).toBeUndefined();
  });
});
