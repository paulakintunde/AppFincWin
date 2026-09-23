// D-15: one routine wipes every subsystem's device data on sign-out / account deletion.
//
// Phase 0 registers only the encrypted-session key, via LargeSecureStore's
// `registerSecureKey` calls (src/services/supabase/largeSecureStore.ts), plus the PostHog
// reset added in 00-18. Phase 1 registers the TanStack Query cache and the offline write
// queue here via `registerWipeHandler` once those subsystems exist.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const STORAGE_PREFIX = 'fincwin:';
const SECURE_KEY_INDEX_KEY = `${STORAGE_PREFIX}secure-key-index`;

export interface WipeHandler {
  id: string;
  wipe(): Promise<void>;
  pendingWriteCount?(): Promise<number>;
}

const handlers = new Map<string, WipeHandler>();

/**
 * Registers a subsystem's wipe handler. Returns an unregister function.
 */
export function registerWipeHandler(handler: WipeHandler): () => void {
  handlers.set(handler.id, handler);
  return () => {
    handlers.delete(handler.id);
  };
}

async function readSecureKeyIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SECURE_KEY_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Records a SecureStore key name so wipeDeviceData can delete it later. Called by
 * LargeSecureStore whenever it creates a new per-value encryption key.
 */
export async function registerSecureKey(name: string): Promise<void> {
  const existing = await readSecureKeyIndex();
  if (existing.includes(name)) return;
  await AsyncStorage.setItem(SECURE_KEY_INDEX_KEY, JSON.stringify([...existing, name]));
}

/**
 * Sums the pending-write count reported by every registered subsystem, so the wipe
 * confirmation UI can warn the user before they lose unsynced changes.
 */
export async function getPendingWriteCount(): Promise<number> {
  const counts = await Promise.all(
    Array.from(handlers.values()).map((h) => (h.pendingWriteCount ? h.pendingWriteCount() : Promise.resolve(0)))
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Wipes every subsystem's device data: registered handlers first, then every SecureStore
 * key recorded via registerSecureKey, then every AsyncStorage key under the fincwin: prefix
 * (the secure-key index included). The secure-key index is read before AsyncStorage is
 * cleared. One step failing does not stop the rest from running; failures are collected and
 * re-thrown together once every step has been attempted.
 */
export async function wipeDeviceData(): Promise<void> {
  const errors: unknown[] = [];

  for (const handler of handlers.values()) {
    try {
      await handler.wipe();
    } catch (err) {
      errors.push(err);
    }
  }

  const secureKeys = await readSecureKeyIndex();
  for (const key of secureKeys) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      errors.push(err);
    }
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefixed = allKeys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (prefixed.length > 0) {
      await AsyncStorage.multiRemove(prefixed);
    }
  } catch (err) {
    errors.push(err);
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'wipeDeviceData: one or more wipe steps failed');
  }
}
