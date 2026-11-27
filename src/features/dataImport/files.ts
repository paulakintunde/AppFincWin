/**
 * 10-18 (DAT-03): the two file touches of the import screen. A chosen CSV is read on this phone and goes nowhere else
 * (the picker's cache copy is removed on every path); a template is saved through the share sheet on iOS and a folder
 * picker on Android, as Export does.
 */
import { Platform, Share } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { withExternalActivity } from '@/services/lock/externalActivity';

const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'text/plain'];
/** A CSV of 5000 rows is well under this; anything bigger is not one of ours. */
const MAX_BYTES = 5 * 1024 * 1024;

export type PickCsvResult = { kind: 'ok'; text: string } | { kind: 'canceled' } | { kind: 'unreadable' };

export async function pickCsvText(): Promise<PickCsvResult> {
  let picked: Awaited<ReturnType<typeof getDocumentAsync>>;
  try {
    picked = await withExternalActivity(() => getDocumentAsync({ type: CSV_TYPES, copyToCacheDirectory: true, multiple: false })); // 10-review (L-6)
  } catch {
    return { kind: 'unreadable' };
  }
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (asset === undefined) return { kind: 'canceled' };
  let file: File | null = null;
  try {
    file = new File(asset.uri);
    if ((asset.size ?? file.size) > MAX_BYTES) return { kind: 'unreadable' };
    return { kind: 'ok', text: await file.text() };
  } catch {
    return { kind: 'unreadable' };
  } finally {
    try {
      file?.delete();
    } catch {
      // The copy sits in the OS cache; failing to remove it must not fail the import.
    }
  }
}

/** 'saved' or 'shared' when it went out, 'cancelled' when the person backed out. */
export async function saveTemplateFile(name: string, text: string): Promise<'saved' | 'shared' | 'cancelled'> {
  const dir = new Directory(Paths.cache, 'fincwin-import-template');
  try {
    if (!dir.exists) dir.create();
    if (Platform.OS === 'android') {
      let target: Directory;
      try {
        target = await withExternalActivity(() => Directory.pickDirectoryAsync()); // 10-review (L-6)
      } catch {
        return 'cancelled';
      }
      target.createFile(name.replace(/\.csv$/, ''), 'text/csv').write(text);
      return 'saved';
    }
    const file = new File(dir, name);
    if (!file.exists) file.create();
    file.write(text);
    const result = await withExternalActivity(() => Share.share({ url: file.uri })); // 10-review (L-6)
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } finally {
    try {
      if (dir.exists) dir.delete();
    } catch {
      // The cache is cleared by the system anyway.
    }
  }
}
