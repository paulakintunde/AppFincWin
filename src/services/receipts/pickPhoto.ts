// 10.1-02 (D-06): one photo from the camera or the library, shrunk by prepareImage. Android's library pick uses the
// system photo picker (no permission); iOS asks for photo access. Reason codes only, nothing logged.
import { Platform } from 'react-native';
import { prepareImage } from './compress';
import type { PickResult } from './types';

interface PickerAsset {
  uri: string;
}
type PickerOutcome = { canceled: boolean; assets: PickerAsset[] | null };

export interface PickPhotoDeps {
  requestCamera(): Promise<boolean>;
  requestLibrary(): Promise<boolean>;
  launchCamera(): Promise<PickerOutcome>;
  launchLibrary(): Promise<PickerOutcome>;
  prepare: typeof prepareImage;
}

export function defaultPickPhotoDeps(): PickPhotoDeps {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ip = () => require('expo-image-picker') as typeof import('expo-image-picker');
  const opts = { mediaTypes: ['images' as const], allowsMultipleSelection: false, exif: false, quality: 1 };
  return {
    requestCamera: async () => (await ip().requestCameraPermissionsAsync()).granted,
    requestLibrary: async () => (Platform.OS === 'android' ? true : (await ip().requestMediaLibraryPermissionsAsync()).granted),
    launchCamera: () => ip().launchCameraAsync(opts),
    launchLibrary: () => ip().launchImageLibraryAsync(opts),
    prepare: prepareImage,
  };
}

export async function pickPhoto(source: 'camera' | 'library', deps?: PickPhotoDeps): Promise<PickResult> {
  try {
    const d = deps ?? defaultPickPhotoDeps();
    const granted = source === 'camera' ? await d.requestCamera() : await d.requestLibrary();
    if (!granted) return { ok: false, reason: 'permission_denied' };
    const picked = source === 'camera' ? await d.launchCamera() : await d.launchLibrary();
    const asset = picked.canceled ? undefined : picked.assets?.[0];
    if (asset === undefined) return { ok: false, reason: 'cancelled' };
    const prepared = await d.prepare(asset.uri);
    if (!prepared.ok) return { ok: false, reason: prepared.reason };
    return { ok: true, kind: 'photo', files: [prepared.file] };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
