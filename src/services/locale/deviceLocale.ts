// D-22: numbers and dates format by the device region (via expo-localization plus Intl)
// even while app copy stays English-only -- grouping, decimal mark, date order and symbol
// placement all follow the device's own region and currency settings, not a hardcoded
// locale. D-25: engine/ never reads device state itself; these two reads are the only
// place the device's locale/zone enter the app, and every value they produce is passed
// into engine functions as an explicit parameter, never read by the engine directly.
import { getCalendars, getLocales, useCalendars, useLocales } from 'expo-localization';

const FALLBACK_LOCALE = 'en-US';
const FALLBACK_TIME_ZONE = 'UTC';

export function getDeviceLocale(): string {
  return getLocales()[0]?.languageTag ?? FALLBACK_LOCALE;
}

export function getDeviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? FALLBACK_TIME_ZONE;
}

export interface DeviceLocale {
  locale: string;
  timeZone: string;
}

/** Reactive counterpart of getDeviceLocale/getDeviceTimeZone -- rerenders if the OS region changes. */
export function useDeviceLocale(): DeviceLocale {
  const locales = useLocales();
  const calendars = useCalendars();
  return {
    locale: locales[0]?.languageTag ?? FALLBACK_LOCALE,
    timeZone: calendars[0]?.timeZone ?? FALLBACK_TIME_ZONE,
  };
}
