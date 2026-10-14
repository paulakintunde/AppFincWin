// D-17/D-25: device-only draft of the entry-sheet list and half-typed form; never synced; inside the
// fincwin: prefix so sign-out wipes it. Storage failures never throw (a lost draft is not an error).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX } from '@/services/storage/wipe';
import {
  parseEntryDraft,
  serialiseDraft,
  type DraftForm,
  type EntryDraft,
  type ListItem,
} from '@/engine/entryList';

// The key keeps `v1` on purpose: only the payload version changed (v2 adds the form and v1 still
// parses), so a draft stored before this change is still found.
export function entryDraftKey(userId: string, householdId: string): string {
  return `${STORAGE_PREFIX}entry-draft:v1:${userId}:${householdId}`;
}

export async function loadEntryDraft(userId: string, householdId: string): Promise<EntryDraft> {
  try {
    return parseEntryDraft(await AsyncStorage.getItem(entryDraftKey(userId, householdId)));
  } catch {
    return { items: [], form: null };
  }
}

export async function saveEntryDraft(
  userId: string,
  householdId: string,
  items: readonly ListItem[],
  form: DraftForm | null = null,
): Promise<void> {
  try {
    const key = entryDraftKey(userId, householdId);
    if (items.length === 0 && form === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, serialiseDraft(items, new Date().toISOString(), form));
  } catch {
    // device storage unavailable: the draft simply is not kept
  }
}

export async function clearEntryDraft(userId: string, householdId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(entryDraftKey(userId, householdId));
  } catch {
    // ignore
  }
}
