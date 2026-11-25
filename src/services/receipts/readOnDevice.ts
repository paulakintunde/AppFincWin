// 10.1-02 (D-18): phone-only reading. Module order of preference, settled by the 10.1-08 Pixel spike: 1 @react-native-ml-kit/text-recognition (blocks > lines with frames); 2 @infinitered/react-native-mlkit-text-recognition (Expo module) if 1 fails to load on RN 0.86; 3 expo-text-extractor (text only: frames null, the parser falls back to line order); 4 none: readOnDevice returns 'unavailable' and the review screen opens with the photo and empty rows (D-18).
// T-10.1-02-02: this module never logs OCR text; failures are reason codes only.
import type { OcrFrame, OcrLine, ReadResult } from './types';

export type { OcrResult } from './types';

interface RawLine {
  text: string;
  frame?: OcrFrame | null;
}

export interface ReadDeps {
  /** Run the native reader. Strings mean the module gave text only. Throws when the module is missing. */
  recognize(imageUri: string): Promise<{ lines: (RawLine | string)[] }>;
  imageSize(imageUri: string): Promise<{ width: number; height: number } | null>;
}

export function defaultReadDeps(): ReadDeps {
  return {
    recognize: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-ml-kit/text-recognition') as typeof import('@react-native-ml-kit/text-recognition');
      const out = await mod.default.recognize(uri);
      const lines: RawLine[] = [];
      for (const block of out.blocks) {
        for (const line of block.lines) lines.push({ text: line.text, frame: line.frame ?? null });
      }
      return { lines };
    },
    imageSize: async (uri) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Image } = require('react-native') as typeof import('react-native');
        return await new Promise((resolve, reject) => {
          Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
        });
      } catch {
        return null;
      }
    },
  };
}

export async function readOnDevice(imageUri: string, deps?: ReadDeps): Promise<ReadResult> {
  let raw: { lines: (RawLine | string)[] };
  let d: ReadDeps;
  try {
    d = deps ?? defaultReadDeps();
    raw = await d.recognize(imageUri);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const lines: OcrLine[] = [];
    for (const item of raw.lines) {
      const text = typeof item === 'string' ? item : item.text;
      if (text.trim() === '') continue;
      const f = typeof item === 'string' ? null : (item.frame ?? null);
      lines.push({ text, frame: f === null ? null : { left: f.left, top: f.top, width: f.width, height: f.height } });
    }
    if (lines.length === 0) return { ok: false, reason: 'empty' };
    const size = await d.imageSize(imageUri);
    return { ok: true, result: { lines, imageWidth: size?.width ?? null, imageHeight: size?.height ?? null } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
