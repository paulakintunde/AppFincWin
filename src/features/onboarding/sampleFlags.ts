// 09-24 (D-17b, UI-SPEC 4): two one-time flags for the sample-data look-around, kept per user on this phone.
// sample-opened: the look-around has opened on the sample Decide answer once; later launches open Home.
// sample-card: "Explore the app" was tapped on the sample figures card, so the card stays hidden.
// The keys start with `fincwin:` so wipeDeviceData() clears them on sign-out and account deletion.
// Device-local only, never synced. A failed read counts as not set; a failed write is swallowed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX } from '@/services/storage/wipe';

export function sampleOpenedKey(userId: string): string {
  return `${STORAGE_PREFIX}sample-opened:${userId}`;
}

export function sampleCardKey(userId: string): string {
  return `${STORAGE_PREFIX}sample-card:${userId}`;
}

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch {
    return false;
  }
}

async function setFlag(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    // A flag that cannot be remembered only means the one-time step may show again.
  }
}

export const loadSampleOpened = (userId: string): Promise<boolean> => readFlag(sampleOpenedKey(userId));
export const markSampleOpened = (userId: string): Promise<void> => setFlag(sampleOpenedKey(userId));
export const loadSampleCardDone = (userId: string): Promise<boolean> => readFlag(sampleCardKey(userId));
export const markSampleCardDone = (userId: string): Promise<void> => setFlag(sampleCardKey(userId));
