// 10.1-17 (D-07, RCP-03): opening a receipt. Files stay private in the bucket; a signed link is made on demand, lasts 60 seconds
// and is never stored (not in the query cache, not in state that outlives the screen). PDFs are downloaded to a temp file and
// handed to the system viewer. This module never logs links, paths or file names.
import { RECEIPT_BUCKET } from './upload';

export const SIGNED_URL_SECONDS = 60;
const VIEW_DIR = 'receipt-view';

export interface OpenReceiptDeps {
  sign(objectPath: string, seconds: number): Promise<string | null>;
  /** Downloads the url into the temp folder and returns the local file uri. */
  download(url: string, fileName: string): Promise<string>;
  share(uri: string): Promise<void>;
  remove(uri: string): Promise<void>;
}

export function defaultOpenReceiptDeps(): OpenReceiptDeps {
  return {
    sign: async (objectPath, seconds) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { supabase } = require('@/services/supabase') as typeof import('@/services/supabase');
      const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(objectPath, seconds);
      return error || !data ? null : data.signedUrl;
    },
    download: async (url, fileName) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const dir = new Directory(Paths.cache, VIEW_DIR);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const target = new File(dir, fileName);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(url, target);
      return file.uri;
    },
    share: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    },
    remove: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      const f = new File(uri);
      if (f.exists) f.delete();
    },
  };
}

/** A link that works for 60 seconds, or null when the server refuses (no access, no file, offline). */
export async function signedUrlFor(objectPath: string, deps: Partial<OpenReceiptDeps> = {}): Promise<string | null> {
  const d: OpenReceiptDeps = { ...defaultOpenReceiptDeps(), ...deps };
  try {
    return await d.sign(objectPath, SIGNED_URL_SECONDS);
  } catch {
    return null;
  }
}

let lastTemp: string | null = null;

/** Downloads the PDF and opens the system viewer. The previous temp file is removed on each call. */
export async function openPdf(objectPath: string, deps: Partial<OpenReceiptDeps> = {}): Promise<'opened' | 'failed'> {
  const d: OpenReceiptDeps = { ...defaultOpenReceiptDeps(), ...deps };
  if (lastTemp !== null) {
    const old = lastTemp;
    lastTemp = null;
    await d.remove(old).catch(() => undefined);
  }
  try {
    const url = await signedUrlFor(objectPath, d);
    if (url === null) return 'failed';
    const uri = await d.download(url, 'receipt.pdf');
    lastTemp = uri;
    await d.share(uri);
    return 'opened';
  } catch {
    return 'failed';
  }
}
