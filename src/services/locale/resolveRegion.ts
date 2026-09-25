// RD-02: region precedence for number formatting and currency defaults --
// explicit in-app region override > device region > time zone tiebreak.
// Deliberately NO IP geolocation: every input here is either the user's own
// stated preference or something the device itself reports, never a network
// lookup. Pure -- takes every input as a parameter and performs no I/O of
// its own, so it is safe to unit test and to call from both the reactive
// (useDeviceLocale) and non-reactive (getDeviceLocale/getDeviceSeparators)
// call sites in deviceLocale.ts.

export interface ResolveRegionInput {
  /** The user's own in-app region preference (profiles.region), or null/undefined when unset. */
  override?: string | null;
  /** The device's own reported region (expo-localization's regionCode), when known. */
  deviceRegion?: string | null;
  /** The device's IANA time zone -- consulted only when the device reports no region at all. */
  timeZone?: string | null;
}

// Time zone tiebreak: used only when the device itself reports no region. Deliberately a
// small, documented set of zones that name exactly one country -- not general-purpose
// IANA-zone-to-country data, and not a substitute for a real region. A zone outside this list
// (or an ambiguous multi-country zone such as most Africa/* entries) resolves to no tiebreak
// rather than a guess.
const TIME_ZONE_REGION: Readonly<Record<string, string>> = {
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Vancouver': 'CA',
  'America/Toronto': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Lisbon': 'PT',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL',
  'Europe/Athens': 'GR',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Brisbane': 'AU',
  'Pacific/Auckland': 'NZ',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Kolkata': 'IN',
  'Asia/Singapore': 'SG',
  'Asia/Dubai': 'AE',
};

const REGION_RE = /^[A-Z]{2}$/;

function normalizeRegion(region: string | null | undefined): string | undefined {
  if (!region) return undefined;
  const upper = region.trim().toUpperCase();
  return REGION_RE.test(upper) ? upper : undefined;
}

export function resolveRegion(input: ResolveRegionInput): string | undefined {
  const override = normalizeRegion(input.override);
  if (override) return override;

  const deviceRegion = normalizeRegion(input.deviceRegion);
  if (deviceRegion) return deviceRegion;

  const zone = input.timeZone?.trim();
  if (zone && zone in TIME_ZONE_REGION) return TIME_ZONE_REGION[zone];

  return undefined;
}
