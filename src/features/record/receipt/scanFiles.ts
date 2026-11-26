// 10.1-25 (T-10.1-25-01): the phone copies a scan reads from. Picked files and downloaded copies of stored receipts live in
// the cache folder only while the scan sheet is open; whoever opened the sheet deletes them when it closes. Files the upload
// outbox owns are never deleted here. Nothing here logs links, paths or file names.
import { defaultOpenReceiptDeps, type OpenReceiptDeps } from '@/services/receipts/openReceipt';
import { defaultOutboxDeps } from '@/services/receipts/outbox';

export interface ReadingImage {
  uri: string;
  mime: string;
}

/** Deletes cache copies; a file that is already gone or cannot be deleted is skipped quietly. */
export function discardFiles(uris: readonly string[], remove: (uri: string) => Promise<void> = defaultOutboxDeps().remove): void {
  for (const uri of uris) void remove(uri).catch(() => undefined);
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let seq = 0;

/**
 * Turns the Receipt sheet's pages (a signed link for a stored page, or the outbox's own file for one still waiting) into
 * files the phone can read. Signed links are downloaded to the cache; those copies are returned in `temps` for the caller
 * to delete. A page that does not download is left out.
 */
export async function copiesForReading(
  images: readonly ReadingImage[],
  deps: Pick<OpenReceiptDeps, 'download'> = defaultOpenReceiptDeps(),
): Promise<{ images: ReadingImage[]; temps: string[] }> {
  const out: ReadingImage[] = [];
  const temps: string[] = [];
  for (const img of images) {
    if (!/^https?:/i.test(img.uri)) {
      out.push(img);
      continue;
    }
    seq += 1;
    try {
      const uri = await deps.download(img.uri, `read-${Date.now()}-${seq}.${EXT[img.mime] ?? 'jpg'}`);
      out.push({ uri, mime: img.mime });
      temps.push(uri);
    } catch {
      // a page that does not download is skipped; the reading uses the pages it has
    }
  }
  return { images: out, temps };
}
