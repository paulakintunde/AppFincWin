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
  introSeenVersion?: string;
  setupDoneSeen?: true;
  /** 06.1-66 (FQ5): the first-answer safety-net question was shown and put away (answered or not); the gate asks it once. */
  netQuestionSeen?: true;
}

/** The stored record, or an empty v1 record when it is missing, unreadable or another version. Never throws. */
async function readRecord(userId: string): Promise<HintsRecord> {
  try {
    const raw = await AsyncStorage.getItem(decideHintsKey(userId));
    if (!raw) return { v: 1 };
    const parsed = JSON.parse(raw) as { v?: unknown; foldHintSeen?: unknown; homeBasisSeen?: unknown; introSeenVersion?: unknown; setupDoneSeen?: unknown; netQuestionSeen?: unknown } | null;
    if (parsed?.v !== 1) return { v: 1 };
    const record: HintsRecord = { v: 1 };
    if (parsed.foldHintSeen === true) record.foldHintSeen = true;
    if (parsed.homeBasisSeen === true) record.homeBasisSeen = true;
    if (typeof parsed.introSeenVersion === 'string') record.introSeenVersion = parsed.introSeenVersion;
    if (parsed.setupDoneSeen === true) record.setupDoneSeen = true;
    if (parsed.netQuestionSeen === true) record.netQuestionSeen = true;
    return record;
  } catch {
    return { v: 1 };
  }
}

async function markFlag(userId: string, flag: 'foldHintSeen' | 'homeBasisSeen' | 'setupDoneSeen' | 'netQuestionSeen'): Promise<void> {
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

/** D-25: the version of the 'How Decide answers' card last seen on this phone, or null. A changed text shows it again. Never throws. */
export async function loadIntroSeenVersion(userId: string): Promise<string | null> {
  return (await readRecord(userId)).introSeenVersion ?? null;
}

export async function markIntroSeen(userId: string, version: string): Promise<void> {
  try {
    const record = await readRecord(userId);
    record.introSeenVersion = version;
    await AsyncStorage.setItem(decideHintsKey(userId), JSON.stringify(record));
  } catch {
    // A card that cannot be remembered simply shows again.
  }
}

/** The setup-done card is shown once per phone. */
export async function loadSetupDoneSeen(userId: string): Promise<boolean> {
  return (await readRecord(userId)).setupDoneSeen === true;
}

export async function markSetupDoneSeen(userId: string): Promise<void> {
  await markFlag(userId, 'setupDoneSeen');
}

/** 06.1-66 (FQ5): true once the first-answer safety-net question was put away on this phone, even by a swipe. Nothing is written to the account. */
export async function loadNetQuestionSeen(userId: string): Promise<boolean> {
  return (await readRecord(userId)).netQuestionSeen === true;
}

export async function markNetQuestionSeen(userId: string): Promise<void> {
  await markFlag(userId, 'netQuestionSeen');
}
