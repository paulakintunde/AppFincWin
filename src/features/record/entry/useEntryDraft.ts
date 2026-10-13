// D-17: device-only draft of the entry-sheet list; never synced; inside the fincwin:
// prefix so sign-out wipes it. Storage failures never throw (a lost draft is not an error).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX } from '@/services/storage/wipe';
import { parseDraft, serialiseDraft, type ListItem } from '@/engine/entryList';

export function entryDraftKey(userId: string, householdId: string): string {
  return `${STORAGE_PREFIX}entry-draft:v1:${userId}:${householdId}`;
}

export async function loadEntryDraft(userId: string, householdId: string): Promise<ListItem[]> {
  try {
    return parseDraft(await AsyncStorage.getItem(entryDraftKey(userId, householdId)));
  } catch {
    return [];
  }
}

export async function saveEntryDraft(userId: string, householdId: string, items: readonly ListItem[]): Promise<void> {
  try {
    const key = entryDraftKey(userId, householdId);
    if (items.length === 0) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, serialiseDraft(items, new Date().toISOString()));
  } catch {
    // device storage unavailable: the list simply is not kept
  }
}

export async function clearEntryDraft(userId: string, householdId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(entryDraftKey(userId, householdId));
  } catch {
    // ignore
  }
}
