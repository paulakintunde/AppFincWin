// Persisted app-lock state (ACC-08/ACC-09). Secrets and counters live in SecureStore (hardware-backed, survives
// "clear app storage" attempts on the AsyncStorage side); non-secret settings live in AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { registerWipeHandler, STORAGE_PREFIX } from '@/services/storage/wipe';
import { backoffFor, constantTimeEqual, hashPin, isValidPin, LOCK_TIMING_MS, type Backoff, type LockTiming } from './pin';

/** D-33: 'device' = the phone's own lock (biometric, passcode fallback); 'appPin' = the optional extra FincWin PIN. */
export type LockMethod = 'device' | 'appPin';

export interface LockSettings {
  enabled: boolean;
  lockMethod: LockMethod;
  timing: LockTiming;
  biometric: boolean;
  offerAnswered: boolean;
  ownerUserId: string | null;
}

export const DEFAULT_LOCK_SETTINGS: LockSettings = {
  enabled: false,
  lockMethod: 'device',
  timing: 'oneMinute',
  biometric: false,
  offerAnswered: false,
  ownerUserId: null,
};

export interface LockState {
  settings: LockSettings;
  hasPin: boolean;
  wrongTries: number;
  lockUntil: number | null;
  backgroundedAt: number | null;
}

const SETTINGS_KEY = `${STORAGE_PREFIX}lock-settings`;
const KEY_HASH = 'fincwin.lock.hash';
const KEY_SALT = 'fincwin.lock.salt';
const KEY_TRIES = 'fincwin.lock.tries';
const KEY_UNTIL = 'fincwin.lock.until';
const KEY_BG = 'fincwin.lock.bg';
const ALL_KEYS = [KEY_HASH, KEY_SALT, KEY_TRIES, KEY_UNTIL, KEY_BG];
const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function readNumber(key: string): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function writeNumber(key: string, n: number): Promise<void> {
  await SecureStore.setItemAsync(key, String(n), SECURE_OPTS);
}

async function readSettings(): Promise<LockSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_LOCK_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<LockSettings>;
    const timing = parsed.timing && parsed.timing in LOCK_TIMING_MS ? parsed.timing : DEFAULT_LOCK_SETTINGS.timing;
    const lockMethod: LockMethod = parsed.lockMethod === 'appPin' ? 'appPin' : 'device';
    return { ...DEFAULT_LOCK_SETTINGS, ...parsed, timing, lockMethod };
  } catch {
    return { ...DEFAULT_LOCK_SETTINGS };
  }
}

export async function loadLockState(): Promise<LockState> {
  const [settings, hash, tries, lockUntil, backgroundedAt] = await Promise.all([
    readSettings(),
    SecureStore.getItemAsync(KEY_HASH),
    readNumber(KEY_TRIES),
    readNumber(KEY_UNTIL),
    readNumber(KEY_BG),
  ]);
  return { settings, hasPin: hash !== null, wrongTries: tries ?? 0, lockUntil, backgroundedAt };
}

export async function saveLockSettings(patch: Partial<LockSettings>): Promise<LockSettings> {
  const next = { ...(await readSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** New salt, stores the hash, clears the try counter and any wait. */
export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN must be 6 digits');
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(KEY_SALT, salt, SECURE_OPTS);
  await SecureStore.setItemAsync(KEY_HASH, hash, SECURE_OPTS);
  await clearTries();
}

export async function clearTries(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_TRIES);
  await SecureStore.deleteItemAsync(KEY_UNTIL);
}

export async function checkPin(
  pin: string,
  now: number
): Promise<{ ok: true } | { ok: false; backoff: Backoff; wrongTries: number }> {
  const [tries, lockUntil, salt, hash] = await Promise.all([
    readNumber(KEY_TRIES),
    readNumber(KEY_UNTIL),
    SecureStore.getItemAsync(KEY_SALT),
    SecureStore.getItemAsync(KEY_HASH),
  ]);
  const wrongTries = tries ?? 0;
  if (wrongTries >= 10) return { ok: false, backoff: { kind: 'reauth' }, wrongTries };
  if (lockUntil !== null && now < lockUntil) {
    return { ok: false, backoff: { kind: 'wait', ms: lockUntil - now }, wrongTries };
  }
  const matches = salt !== null && hash !== null && isValidPin(pin) && constantTimeEqual(await hashPin(pin, salt), hash);
  if (matches) {
    await clearTries();
    return { ok: true };
  }
  const next = wrongTries + 1;
  const backoff = backoffFor(next);
  await writeNumber(KEY_TRIES, next);
  if (backoff.kind === 'wait') await writeNumber(KEY_UNTIL, now + backoff.ms);
  return { ok: false, backoff, wrongTries: next };
}

export async function markBackgrounded(now: number): Promise<void> {
  await writeNumber(KEY_BG, now);
}

export function shouldLockOnActive(s: LockState, now: number, coldStart: boolean): boolean {
  if (!s.settings.enabled) return false;
  if (coldStart || s.backgroundedAt === null) return true;
  return now - s.backgroundedAt >= LOCK_TIMING_MS[s.settings.timing];
}

export async function clearLock(): Promise<void> {
  for (const k of ALL_KEYS) await SecureStore.deleteItemAsync(k);
  await AsyncStorage.removeItem(SETTINGS_KEY);
}

export function registerLockWipe(): () => void {
  return registerWipeHandler({ id: 'appLock', wipe: clearLock });
}
