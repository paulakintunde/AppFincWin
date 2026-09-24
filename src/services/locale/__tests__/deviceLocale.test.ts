import { getCalendars, getLocales, useCalendars, useLocales } from 'expo-localization';
import { renderHook } from '@testing-library/react-native';
import { getDeviceLocale, getDeviceTimeZone, useDeviceLocale } from '../deviceLocale';

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
    mockUseLocales.mockReturnValue([{ languageTag: 'fr-CA' }]);
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
