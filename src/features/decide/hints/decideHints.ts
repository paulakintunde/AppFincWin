// D-75 / UI-SPEC R1: the one-time step 3 hint's seen flag, remembered per user on this device.
// D-95 / R17.13 M3: the same record also holds homeBasisSeen (the "Now from your logged months" label shows once). The
// record is v1 with optional flags; each write reads the record, merges its own flag and writes it back.
// The key starts with `fincwin:` so wipeDeviceData() clears it on sign-out and account deletion.
// Device-local only: never synced, never reported. A failed read counts as not seen; a failed write is swallowed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX } from '@/services/storage/wipe';

export function decideHintsKey(userId: string): string {
  return `${STORAGE_PREFIX}decide-hints:${userId}`;
}

interface HintsRecord {
  v: 1;
  foldHintSeen?: true;
  homeBasisSeen?: true;
}

/** The stored record, or an empty v1 record when it is missing, unreadable or another version. Never throws. */
async function readRecord(userId: string): Promise<HintsRecord> {
  try {
    const raw = await AsyncStorage.getItem(decideHintsKey(userId));
    if (!raw) return { v: 1 };
    const parsed = JSON.parse(raw) as { v?: unknown; foldHintSeen?: unknown; homeBasisSeen?: unknown } | null;
    if (parsed?.v !== 1) return { v: 1 };
    const record: HintsRecord = { v: 1 };
    if (parsed.foldHintSeen === true) record.foldHintSeen = true;
    if (parsed.homeBasisSeen === true) record.homeBasisSeen = true;
    return record;
  } catch {
    return { v: 1 };
  }
}

async function markFlag(userId: string, flag: 'foldHintSeen' | 'homeBasisSeen'): Promise<void> {
  try {
    const record = await readRecord(userId);
    record[flag] = true;
    await AsyncStorage.setItem(decideHintsKey(userId), JSON.stringify(record));
  } catch {
    // A hint that cannot be remembered is not worth interrupting the screen for.
  }
}

export async function loadFoldHintSeen(userId: string): Promise<boolean> {
  return (await readRecord(userId)).foldHintSeen === true;
}

export async function markFoldHintSeen(userId: string): Promise<void> {
  await markFlag(userId, 'foldHintSeen');
}

/** D-95: true once the home has rendered on the logged basis for this user on this device. A failed read counts as not seen. */
export async function loadHomeBasisSeen(userId: string): Promise<boolean> {
  return (await readRecord(userId)).homeBasisSeen === true;
}

export async function markHomeBasisSeen(userId: string): Promise<void> {
  await markFlag(userId, 'homeBasisSeen');
}
