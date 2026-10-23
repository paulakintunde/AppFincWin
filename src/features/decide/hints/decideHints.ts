// D-75 / UI-SPEC R1: the one-time step 3 hint's seen flag, remembered per user on this device.
// The key starts with `fincwin:` so wipeDeviceData() clears it on sign-out and account deletion.
// Device-local only: never synced, never reported. A failed read counts as not seen; a failed write is swallowed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX } from '@/services/storage/wipe';

export function decideHintsKey(userId: string): string {
  return `${STORAGE_PREFIX}decide-hints:${userId}`;
}

export async function loadFoldHintSeen(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(decideHintsKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: unknown; foldHintSeen?: unknown } | null;
    return parsed?.v === 1 && parsed.foldHintSeen === true;
  } catch {
    return false;
  }
}

export async function markFoldHintSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(decideHintsKey(userId), JSON.stringify({ v: 1, foldHintSeen: true }));
  } catch {
    // A hint that cannot be remembered is not worth interrupting the screen for.
  }
}
