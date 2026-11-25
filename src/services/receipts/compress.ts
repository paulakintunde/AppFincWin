// 10.1-02 (D-21): shrink to about 2,000 px on the long side (never upscale), save as JPEG so HEIC and PNG
// become JPEG, then refuse anything over 5 MB. Failures are reason codes only; nothing is logged.
import { RECEIPT_JPEG_QUALITY, RECEIPT_LONG_EDGE_PX, RECEIPT_MAX_BYTES } from './limits';
import type { LocalReceiptFile } from './types';

export interface CompressDeps {
  /** Pixel size of the source image. */
  getSize(uri: string): Promise<{ width: number; height: number }>;
  /** Resize (when `resize` is set) and save as JPEG. */
  manipulate(
    uri: string,
    resize: { width: number } | { height: number } | null,
    quality: number,
  ): Promise<{ uri: string; width: number; height: number }>;
  /** Byte length of a local file. */
  fileBytes(uri: string): Promise<number>;
}

export type PrepareResult = { ok: true; file: LocalReceiptFile } | { ok: false; reason: 'too_big' | 'bad_type' | 'failed' };

export function defaultCompressDeps(): CompressDeps {
  return {
    getSize: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Image } = require('react-native') as typeof import('react-native');
      return new Promise((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
      });
    },
    manipulate: async (uri, resize, quality) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
      const out = await m.manipulateAsync(uri, resize === null ? [] : [{ resize }], {
        compress: quality,
        format: m.SaveFormat.JPEG,
      });
      return { uri: out.uri, width: out.width, height: out.height };
    },
    fileBytes: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      return new File(uri).size;
    },
  };
}

export async function prepareImage(uri: string, deps: CompressDeps = defaultCompressDeps()): Promise<PrepareResult> {
  try {
    const size = await deps.getSize(uri);
    const longEdge = Math.max(size.width, size.height);
    let resize: { width: number } | { height: number } | null = null;
    if (longEdge > RECEIPT_LONG_EDGE_PX) {
      resize = size.width >= size.height ? { width: RECEIPT_LONG_EDGE_PX } : { height: RECEIPT_LONG_EDGE_PX };
    }
    const out = await deps.manipulate(uri, resize, RECEIPT_JPEG_QUALITY);
    const bytes = await deps.fileBytes(out.uri);
    if (bytes > RECEIPT_MAX_BYTES) return { ok: false, reason: 'too_big' };
    return { ok: true, file: { uri: out.uri, mime: 'image/jpeg', ext: 'jpg', bytes, width: out.width, height: out.height } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
