// D-22: numbers and dates format by the device region (via expo-localization plus Intl)
// even while app copy stays English-only -- grouping, decimal mark, date order and symbol
// placement all follow the device's own region and currency settings, not a hardcoded
// locale. D-25: engine/ never reads device state itself; these reads are the only place the
// device's locale/zone enter the app, and every value they produce is passed into engine
// functions as an explicit parameter, never read by the engine directly.
//
// WR-A11: `languageTag` is the first *preferred language* (e.g. 'en-US') and can disagree
// with the device *region* (e.g. Germany), whose number format D-22 says wins. So the locale
// tag is rebuilt from languageCode (+ script) + regionCode, and the region's own decimal and
// grouping marks -- which the native decimal keypad types -- are exposed separately for the
// amount parser (parseAmount's `separators` option).
import { getCalendars, getLocales, useCalendars, useLocales, type Locale } from 'expo-localization';
import type { LocaleSeparators } from '@/engine/money';

const FALLBACK_LOCALE = 'en-US';
const FALLBACK_TIME_ZONE = 'UTC';

/** languageCode[-script]-regionCode when the device reports a region, else languageTag. */
function regionLocaleTag(locale: Locale | undefined): string {
  if (!locale) return FALLBACK_LOCALE;
  const { languageCode, languageScriptCode, regionCode, languageTag } = locale;
  if (languageCode && regionCode) {
    const tag = [languageCode, languageScriptCode, regionCode].filter(Boolean).join('-');
    try {
      const [canonical] = Intl.getCanonicalLocales(tag);
      if (canonical) return canonical;
    } catch {
      // A malformed combination: fall through to the language tag.
    }
  }
  return languageTag || FALLBACK_LOCALE;
}

/** The region's own decimal and grouping marks, when the device reports a usable pair. */
function regionSeparators(locale: Locale | undefined): LocaleSeparators | undefined {
  const decimal = locale?.decimalSeparator;
  const group = locale?.digitGroupingSeparator;
  if (!decimal || !group || decimal === group) return undefined;
  return { decimal, group };
}

export function getDeviceLocale(): string {
  return regionLocaleTag(getLocales()[0]);
}

export function getDeviceSeparators(): LocaleSeparators | undefined {
  return regionSeparators(getLocales()[0]);
}

export function getDeviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? FALLBACK_TIME_ZONE;
}

export interface DeviceLocale {
  locale: string;
  timeZone: string;
  /** WR-A11: pass to parseAmount/parseDecimalString; undefined when the device reports none. */
  separators?: LocaleSeparators;
}

/** Reactive counterpart of getDeviceLocale/getDeviceTimeZone -- rerenders if the OS region changes. */
export function useDeviceLocale(): DeviceLocale {
  const locales = useLocales();
  const calendars = useCalendars();
  return {
    locale: regionLocaleTag(locales[0]),
    timeZone: calendars[0]?.timeZone ?? FALLBACK_TIME_ZONE,
    separators: regionSeparators(locales[0]),
  };
}
