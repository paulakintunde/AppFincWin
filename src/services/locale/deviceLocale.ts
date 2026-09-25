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
//
// RD-02: region precedence is explicit in-app override > device region > time zone tiebreak
// (resolveRegion.ts, pure, no IP geolocation). When the resolved region differs from what the
// device itself reports -- an override is set, or the device reports no region and the time
// zone tiebreak fired -- the locale tag and separators can no longer be read off the device's
// own keyboard (that reflects the *device's* region, not an arbitrary override one), so both
// are derived from Intl for the resolved region instead.
import { getCalendars, getLocales, useCalendars, useLocales, type Locale } from 'expo-localization';
import type { LocaleSeparators } from '@/engine/money';
import { resolveRegion } from './resolveRegion';

const FALLBACK_LOCALE = 'en-US';
const FALLBACK_TIME_ZONE = 'UTC';

/** The device's own reported time zone, defensively tolerant of an unmocked/empty read. */
function deviceTimeZone(): string | undefined {
  return (getCalendars() ?? [])[0]?.timeZone ?? undefined;
}

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

/** languageCode[-script]-region for an arbitrary *resolved* region, not necessarily the device's own. */
function overrideLocaleTag(locale: Locale | undefined, region: string): string {
  const languageCode = locale?.languageCode || 'en';
  const tag = [languageCode, locale?.languageScriptCode, region].filter(Boolean).join('-');
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    if (canonical) return canonical;
  } catch {
    // Falls through to the plain tag below.
  }
  return tag;
}

/**
 * RD-02: an override (or time-zone-tiebroken) region's own separators, derived from Intl --
 * never read off the device's own keyboard, since that reflects the *device's* region, which
 * this may not be.
 */
function overrideSeparators(locale: Locale | undefined, region: string): LocaleSeparators | undefined {
  const languageCode = locale?.languageCode || 'en';
  try {
    const parts = new Intl.NumberFormat(`${languageCode}-${region}`, { useGrouping: true }).formatToParts(1234.5);
    const decimal = parts.find((p) => p.type === 'decimal')?.value;
    const group = parts.find((p) => p.type === 'group')?.value;
    if (!decimal || !group || decimal === group) return undefined;
    return { decimal, group };
  } catch {
    return undefined;
  }
}

interface ResolvedLocale {
  tag: string;
  separators: LocaleSeparators | undefined;
}

/**
 * RD-02's precedence, applied once: if the resolved region differs from the device's own (an
 * override won, or the time-zone tiebreak fired because the device reported none), both the
 * tag and the separators are derived for that resolved region via Intl. Otherwise every
 * existing WR-A11 device-native behaviour is unchanged.
 */
function resolveLocale(locale: Locale | undefined, timeZone: string | undefined, override: string | null | undefined): ResolvedLocale {
  const deviceRegion = locale?.regionCode ?? undefined;
  const region = resolveRegion({ override, deviceRegion, timeZone });

  if (region && region !== deviceRegion) {
    return { tag: overrideLocaleTag(locale, region), separators: overrideSeparators(locale, region) };
  }
  return { tag: regionLocaleTag(locale), separators: regionSeparators(locale) };
}

/** @param regionOverride RD-02: the user's own in-app region preference (profiles.region), when set. */
export function getDeviceLocale(regionOverride?: string | null): string {
  return resolveLocale(getLocales()[0], deviceTimeZone(), regionOverride).tag;
}

/** @param regionOverride RD-02: the user's own in-app region preference (profiles.region), when set. */
export function getDeviceSeparators(regionOverride?: string | null): LocaleSeparators | undefined {
  return resolveLocale(getLocales()[0], deviceTimeZone(), regionOverride).separators;
}

export function getDeviceTimeZone(): string {
  return deviceTimeZone() ?? FALLBACK_TIME_ZONE;
}

export interface DeviceLocale {
  locale: string;
  timeZone: string;
  /** WR-A11: pass to parseAmount/parseDecimalString; undefined when the device reports none. */
  separators?: LocaleSeparators;
}

/**
 * Reactive counterpart of getDeviceLocale/getDeviceTimeZone -- rerenders if the OS region
 * changes. @param regionOverride RD-02: the user's own in-app region preference
 * (profiles.region), when set; undefined/null defers to the device region / time zone
 * tiebreak.
 */
export function useDeviceLocale(regionOverride?: string | null): DeviceLocale {
  const locales = useLocales();
  const calendars = useCalendars();
  const timeZone = calendars[0]?.timeZone ?? FALLBACK_TIME_ZONE;
  const { tag, separators } = resolveLocale(locales[0], timeZone, regionOverride);
  return { locale: tag, timeZone, separators };
}
