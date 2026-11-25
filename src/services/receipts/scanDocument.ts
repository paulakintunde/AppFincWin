// 10.1-02 (D-06, T-10.1-02-05): multi-page document scan. At most RECEIPT_MAX_PAGES_PER_SCAN pages are kept; each
// page is shrunk by prepareImage. A missing native module is 'unavailable'.
import { prepareImage } from './compress';
import { RECEIPT_MAX_PAGES_PER_SCAN } from './limits';
import type { LocalReceiptFile, PickResult } from './types';

export interface ScanDeps {
  scan(pageLimit: number): Promise<{ cancelled: boolean; pages: string[] }>;
  prepare: typeof prepareImage;
}

export function defaultScanDeps(): ScanDeps {
  return {
    scan: async (pageLimit) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-document-scanner-plugin') as typeof import('react-native-document-scanner-plugin');
      const out = await mod.default.scanDocument({
        maxNumDocuments: pageLimit,
        croppedImageQuality: 100,
        responseType: mod.ResponseType.ImageFilePath,
      });
      return { cancelled: out.status !== mod.ScanDocumentResponseStatus.Success, pages: out.scannedImages ?? [] };
    },
    prepare: prepareImage,
  };
}

export async function scanDocument(deps?: ScanDeps): Promise<PickResult> {
  let d: ScanDeps;
  let out: { cancelled: boolean; pages: string[] };
  try {
    d = deps ?? defaultScanDeps();
    out = await d.scan(RECEIPT_MAX_PAGES_PER_SCAN);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (out.cancelled || out.pages.length === 0) return { ok: false, reason: 'cancelled' };
  const files: LocalReceiptFile[] = [];
  for (const page of out.pages.slice(0, RECEIPT_MAX_PAGES_PER_SCAN)) {
    const prepared = await d.prepare(page);
    if (!prepared.ok) return { ok: false, reason: prepared.reason };
    files.push(prepared.file);
  }
  return { ok: true, kind: 'scan', files };
}
