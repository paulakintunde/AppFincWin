import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENT_KEYS, DEFAULT_ACCENT, type AccentKey } from './accents';
import type { FontPairingKey } from './fonts';

/**
 * Local cache of the user's chosen accent and font pairing (D-14 local half — the
 * source of truth is the `profiles` row in Supabase, applied via `applyRemote`). The
 * `fincwin:` prefix means sign-out's wipeDeviceData (src/services/storage/wipe.ts,
 * D-15) deletes this key along with every other device-local key.
 */
export const THEME_CACHE_KEY = 'fincwin:theme';

const FONT_PAIRING_KEYS: readonly FontPairingKey[] = ['bold', 'modern', 'grotesk', 'neutral'];
export const DEFAULT_PAIRING: FontPairingKey = 'bold';

export interface ThemeCacheValue {
  accent: AccentKey;
  pairing: FontPairingKey;
}

const DEFAULTS: ThemeCacheValue = { accent: DEFAULT_ACCENT, pairing: DEFAULT_PAIRING };

function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && (ACCENT_KEYS as readonly string[]).includes(value);
}

function isFontPairingKey(value: unknown): value is FontPairingKey {
  return typeof value === 'string' && FONT_PAIRING_KEYS.includes(value as FontPairingKey);
}

/**
 * Reads the cached theme choice, validating each field against the known enum values.
 * Corrupt JSON, a missing key, or an unknown accent/pairing value all fall back to the
 * defaults (green/bold) rather than throwing — this must never crash app boot.
 */
export async function readThemeCache(): Promise<ThemeCacheValue> {
  try {
    const raw = await AsyncStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return DEFAULTS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;

    const { accent, pairing } = parsed as Record<string, unknown>;
    return {
      accent: isAccentKey(accent) ? accent : DEFAULTS.accent,
      pairing: isFontPairingKey(pairing) ? pairing : DEFAULTS.pairing,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function writeThemeCache(value: ThemeCacheValue): Promise<void> {
  await AsyncStorage.setItem(THEME_CACHE_KEY, JSON.stringify(value));
}
