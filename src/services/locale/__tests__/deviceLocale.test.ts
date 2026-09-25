import { getCalendars, getLocales, useCalendars, useLocales } from 'expo-localization';
import { renderHook } from '@testing-library/react-native';
import { getDeviceLocale, getDeviceSeparators, getDeviceTimeZone, useDeviceLocale } from '../deviceLocale';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
  getCalendars: jest.fn(),
  useLocales: jest.fn(),
  useCalendars: jest.fn(),
}));

const mockGetLocales = getLocales as jest.Mock;
const mockGetCalendars = getCalendars as jest.Mock;
const mockUseLocales = useLocales as jest.Mock;
const mockUseCalendars = useCalendars as jest.Mock;

describe('getDeviceLocale', () => {
  it('returns the first locale entry languageTag', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'pl-PL' }]);
    expect(getDeviceLocale()).toBe('pl-PL');
  });

  it('falls back to en-US when the locales array is empty', () => {
    mockGetLocales.mockReturnValue([]);
    expect(getDeviceLocale()).toBe('en-US');
  });
});

describe('WR-A11: region, not language, decides number format', () => {
  const englishInGermany = {
    languageTag: 'en-US',
    languageCode: 'en',
    languageScriptCode: null,
    regionCode: 'DE',
    decimalSeparator: ',',
    digitGroupingSeparator: '.',
  };

  it('builds the locale tag from languageCode + regionCode', () => {
    mockGetLocales.mockReturnValue([englishInGermany]);
    expect(getDeviceLocale()).toBe('en-DE');
    expect(new Intl.NumberFormat(getDeviceLocale()).format(1234.5)).toBe('1.234,5');
  });

  it('keeps the script code when there is one', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'zh-Hans-CN', languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'TW' }]);
    expect(getDeviceLocale()).toBe('zh-Hans-TW');
  });

  it('falls back to languageTag when the combination is malformed or the region is unknown', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'en-GB', languageCode: 'en', languageScriptCode: null, regionCode: '!!' }]);
    expect(getDeviceLocale()).toBe('en-GB');
    mockGetLocales.mockReturnValue([{ languageTag: 'en-GB', languageCode: 'en', languageScriptCode: null, regionCode: null }]);
    expect(getDeviceLocale()).toBe('en-GB');
    mockGetLocales.mockReturnValue([{ languageTag: '', languageCode: null, regionCode: null }]);
    expect(getDeviceLocale()).toBe('en-US');
  });

  it('exposes the region\'s own separators for the amount parser', () => {
    mockGetLocales.mockReturnValue([englishInGermany]);
    expect(getDeviceSeparators()).toEqual({ decimal: ',', group: '.' });
  });

  it('reports no separators when the device gives none, or an unusable pair', () => {
    mockGetLocales.mockReturnValue([]);
    expect(getDeviceSeparators()).toBeUndefined();
    mockGetLocales.mockReturnValue([{ ...englishInGermany, digitGroupingSeparator: null }]);
    expect(getDeviceSeparators()).toBeUndefined();
    mockGetLocales.mockReturnValue([{ ...englishInGermany, decimalSeparator: '.', digitGroupingSeparator: '.' }]);
    expect(getDeviceSeparators()).toBeUndefined();
  });

  it('useDeviceLocale carries the region tag and separators', async () => {
    mockUseLocales.mockReturnValue([englishInGermany]);
    mockUseCalendars.mockReturnValue([{ timeZone: 'Europe/Berlin' }]);
    const { result } = await renderHook(() => useDeviceLocale());
    expect(result.current).toEqual({
      locale: 'en-DE',
      timeZone: 'Europe/Berlin',
      separators: { decimal: ',', group: '.' },
    });
  });
});

describe('RD-02: region precedence -- override > device region > time zone tiebreak', () => {
  const englishInGermany = {
    languageTag: 'en-US',
    languageCode: 'en',
    languageScriptCode: null,
    regionCode: 'DE',
    decimalSeparator: ',',
    digitGroupingSeparator: '.',
  };

  it('an explicit override wins over the device region for both the tag and the separators', () => {
    mockGetLocales.mockReturnValue([englishInGermany]);
    mockGetCalendars.mockReturnValue([{ timeZone: 'Europe/Berlin' }]);

    expect(getDeviceLocale('US')).toBe('en-US');
    // en-US separators (',' group, '.' decimal) are the *opposite* of the device's own
    // (Germany types ',' as the decimal mark) -- proof this comes from Intl for the
    // override region, not from the device's decimalSeparator/digitGroupingSeparator.
    expect(getDeviceSeparators('US')).toEqual({ decimal: '.', group: ',' });
  });

  it('no override: the device region still wins over any time zone tiebreak', () => {
    mockGetLocales.mockReturnValue([englishInGermany]);
    mockGetCalendars.mockReturnValue([{ timeZone: 'America/Vancouver' }]); // would tiebreak to CA
    expect(getDeviceLocale(null)).toBe('en-DE');
    expect(getDeviceSeparators(undefined)).toEqual({ decimal: ',', group: '.' });
  });

  it('time zone tiebreak only fires when the device reports no region at all', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', languageScriptCode: null, regionCode: null }]);
    mockGetCalendars.mockReturnValue([{ timeZone: 'Europe/Berlin' }]);

    expect(getDeviceLocale()).toBe('en-DE');
  });

  it('an unmapped time zone with no device region falls back to the plain language tag', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en', languageScriptCode: null, regionCode: null }]);
    mockGetCalendars.mockReturnValue([{ timeZone: 'Pacific/Kiritimati' }]); // not in the tiebreak table
    expect(getDeviceLocale()).toBe('en-US');
  });

  it('an invalid override (not two letters) is ignored, falling through to the device region', () => {
    mockGetLocales.mockReturnValue([englishInGermany]);
    mockGetCalendars.mockReturnValue([{ timeZone: 'Europe/Berlin' }]);
    expect(getDeviceLocale('not-a-region')).toBe('en-DE');
  });

  it('useDeviceLocale applies the same override precedence', async () => {
    mockUseLocales.mockReturnValue([englishInGermany]);
    mockUseCalendars.mockReturnValue([{ timeZone: 'Europe/Berlin' }]);
    const { result } = await renderHook(() => useDeviceLocale('US'));
    expect(result.current.locale).toBe('en-US');
    expect(result.current.separators).toEqual({ decimal: '.', group: ',' });
  });
});

describe('getDeviceTimeZone', () => {
  it('returns the first calendar entry timeZone', () => {
    mockGetCalendars.mockReturnValue([{ timeZone: 'Europe/Warsaw' }]);
    expect(getDeviceTimeZone()).toBe('Europe/Warsaw');
  });

  it('falls back to UTC when the calendars array is empty', () => {
    mockGetCalendars.mockReturnValue([]);
    expect(getDeviceTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when the calendar entry has a null timeZone', () => {
    mockGetCalendars.mockReturnValue([{ timeZone: null }]);
    expect(getDeviceTimeZone()).toBe('UTC');
  });
});

describe('useDeviceLocale', () => {
  it('composes useLocales/useCalendars into { locale, timeZone }', async () => {
    // languageCode/regionCode are set here (as a real expo-localization Locale always
    // provides them) so this stays a plain composition test, distinct from the RD-02
    // override/tiebreak cases covered below.
    mockUseLocales.mockReturnValue([{ languageTag: 'fr-CA', languageCode: 'fr', regionCode: 'CA' }]);
    mockUseCalendars.mockReturnValue([{ timeZone: 'America/Toronto' }]);

    const { result } = await renderHook(() => useDeviceLocale());

    expect(result.current).toEqual({ locale: 'fr-CA', timeZone: 'America/Toronto' });
  });

  it('falls back to en-US/UTC when both hooks return empty arrays', async () => {
    mockUseLocales.mockReturnValue([]);
    mockUseCalendars.mockReturnValue([]);

    const { result } = await renderHook(() => useDeviceLocale());

    expect(result.current).toEqual({ locale: 'en-US', timeZone: 'UTC' });
  });
});
