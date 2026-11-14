// 06.2 D-21 / D-28: the app-level Haptics switch. Every haptic in src/ui/haptics.ts reads it.
// Defaults ON. The phone's own vibration setting still silences haptics; this switch only adds
// an app-level off. Stored on the device under the `fincwin:` prefix, so wipeDeviceData() clears
// it on sign-out (T-06.2-03-01); the wipe handler below also resets the in-memory value to ON.
// Only the exact stored string 'false' turns it off; a read error or any other value leaves it ON.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { registerWipeHandler } from '@/services/storage/wipe';

export const HAPTICS_SETTING_KEY = 'fincwin:haptics-enabled';

let enabled = true;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getHapticsEnabled(): boolean {
  return enabled;
}

export function setHapticsEnabled(next: boolean): void {
  enabled = next;
  notify();
  AsyncStorage.setItem(HAPTICS_SETTING_KEY, next ? 'true' : 'false').catch(() => undefined);
}

export async function hydrateHapticsSetting(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HAPTICS_SETTING_KEY);
    const next = raw !== 'false';
    if (next !== enabled) {
      enabled = next;
      notify();
    }
  } catch {
    // An unreadable preference keeps the default (ON).
  }
}

export function subscribeHapticsSetting(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHapticsEnabled(): readonly [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribeHapticsSetting, getHapticsEnabled, getHapticsEnabled);
  return [value, setHapticsEnabled] as const;
}

registerWipeHandler({
  id: 'haptics-setting',
  wipe: async () => {
    enabled = true;
    notify();
  },
});
