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

/** D-107: the Judge-on choice, a device view that drives the home card and every check. */
export type JudgeOn = 'month' | 'worst' | 'average';

function isJudgeOn(v: unknown): v is JudgeOn {
  return v === 'month' || v === 'worst' || v === 'average';
}

interface HintsRecord {
  v: 1;
  foldHintSeen?: true;
  homeBasisSeen?: true;
  judgeOn?: JudgeOn;
  judgeOnDefaulted?: true;
  introSeenVersion?: string;
  setupDoneSeen?: true;
}

/** The stored record, or an empty v1 record when it is missing, unreadable or another version. Never throws. */
async function readRecord(userId: string): Promise<HintsRecord> {
  try {
    const raw = await AsyncStorage.getItem(decideHintsKey(userId));
    if (!raw) return { v: 1 };
    const parsed = JSON.parse(raw) as { v?: unknown; foldHintSeen?: unknown; homeBasisSeen?: unknown; judgeOn?: unknown; judgeOnDefaulted?: unknown; introSeenVersion?: unknown; setupDoneSeen?: unknown } | null;
    if (parsed?.v !== 1) return { v: 1 };
    const record: HintsRecord = { v: 1 };
    if (parsed.foldHintSeen === true) record.foldHintSeen = true;
    if (parsed.homeBasisSeen === true) record.homeBasisSeen = true;
    if (isJudgeOn(parsed.judgeOn)) record.judgeOn = parsed.judgeOn;
    if (parsed.judgeOnDefaulted === true) record.judgeOnDefaulted = true;
    if (typeof parsed.introSeenVersion === 'string') record.introSeenVersion = parsed.introSeenVersion;
    if (parsed.setupDoneSeen === true) record.setupDoneSeen = true;
    return record;
  } catch {
    return { v: 1 };
  }
}

async function markFlag(userId: string, flag: 'foldHintSeen' | 'homeBasisSeen' | 'judgeOnDefaulted' | 'setupDoneSeen'): Promise<void> {
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

/** D-107: the stored Judge-on choice, or null when none is stored or it cannot be read. Never throws. */
export async function loadJudgeOn(userId: string): Promise<JudgeOn | null> {
  return (await readRecord(userId)).judgeOn ?? null;
}

export async function saveJudgeOn(userId: string, value: JudgeOn): Promise<void> {
  try {
    const record = await readRecord(userId);
    record.judgeOn = value;
    await AsyncStorage.setItem(decideHintsKey(userId), JSON.stringify(record));
  } catch {
    // A preference that cannot be saved still holds for this session.
  }
}

/** D-107 (walkthrough round 2): true once the first resolution of the default Judge-on (the update-time switch to This month) is done. */
export async function loadJudgeOnDefaulted(userId: string): Promise<boolean> {
  return (await readRecord(userId)).judgeOnDefaulted === true;
}

export async function markJudgeOnDefaulted(userId: string): Promise<void> {
  await markFlag(userId, 'judgeOnDefaulted');
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
