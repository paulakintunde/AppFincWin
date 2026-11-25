// 10.1-02 (D-06, T-10.1-02-01): a receipt image or PDF from the Files app. Mime allowlist and the 5 MB cap are
// checked here; the bucket checks again. Images are shrunk; PDFs pass through unchanged. File labels are never kept.
import { prepareImage } from './compress';
import { RECEIPT_MAX_BYTES } from './limits';
import type { LocalReceiptFile, PickResult } from './types';

interface DocAsset {
  uri: string;
  size?: number | null;
  mimeType?: string | null;
}

export interface PickFileDeps {
  pick(): Promise<{ canceled: boolean; assets: DocAsset[] | null }>;
  prepare: typeof prepareImage;
}

export function defaultPickFileDeps(): PickFileDeps {
  return {
    pick: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dp = require('expo-document-picker') as typeof import('expo-document-picker');
      return dp.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
    },
    prepare: prepareImage,
  };
}

const IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function pickFile(deps?: PickFileDeps): Promise<PickResult> {
  try {
    const d = deps ?? defaultPickFileDeps();
    const picked = await d.pick();
    const asset = picked.canceled ? undefined : picked.assets?.[0];
    if (asset === undefined) return { ok: false, reason: 'cancelled' };
    const mime = (asset.mimeType ?? '').toLowerCase();
    if (mime === 'application/pdf') {
      const bytes = asset.size ?? 0;
      if (bytes > RECEIPT_MAX_BYTES) return { ok: false, reason: 'too_big' };
      const file: LocalReceiptFile = { uri: asset.uri, mime: 'application/pdf', ext: 'pdf', bytes, width: null, height: null };
      return { ok: true, kind: 'file', files: [file] };
    }
    if (!IMAGE_MIMES.includes(mime)) return { ok: false, reason: 'bad_type' };
    const prepared = await d.prepare(asset.uri);
    if (!prepared.ok) return { ok: false, reason: prepared.reason };
    return { ok: true, kind: 'file', files: [prepared.file] };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
