// D-17 / D-39: a statement file is read on this device and goes nowhere else. Only the rows
// converted from it leave the device, as ordinary inserts. The picker's cache copy is
// removed on every path once the bytes are read, and the file's own label is never kept or
// returned, because bank file labels often carry an account number.
//
// The bytes are read raw (never decoded as text here): Expo's text decoder is UTF-8 only, and
// bank files come as Windows-1252 or UTF-16 as often as UTF-8, so decoding happens in the
// engine (decodeText).
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

// The match-everything entry stays last so iOS never greys out an .ofx or .qfx file that has no registered type (E4).
export const STATEMENT_MIME_TYPES: readonly string[] = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/x-ofx',
  'application/ofx',
  'application/vnd.intu.qfx',
  'application/x-qfx',
  '*/*',
];

export type PickStatementResult =
  | { kind: 'ok'; bytes: Uint8Array; mimeType: string | null; extension: 'csv' | 'ofx' | 'qfx' | 'other' }
  | { kind: 'canceled' }
  | { kind: 'rejected'; reason: 'too_big' | 'unreadable' };

function extensionOf(label: string): 'csv' | 'ofx' | 'qfx' | 'other' {
  const dot = label.lastIndexOf('.');
  if (dot === -1) return 'other';
  const suffix = label.slice(dot + 1).toLowerCase();
  if (suffix === 'csv' || suffix === 'ofx' || suffix === 'qfx') return suffix;
  return 'other';
}

function removeCopy(file: File): void {
  try {
    file.delete();
  } catch {
    // The copy sits in the OS cache directory; failing to remove it must not fail the import.
  }
}

export async function pickStatementBytes(): Promise<PickStatementResult> {
  let picked: Awaited<ReturnType<typeof getDocumentAsync>>;
  try {
    picked = await getDocumentAsync({ type: [...STATEMENT_MIME_TYPES], copyToCacheDirectory: true, multiple: false });
  } catch {
    return { kind: 'rejected', reason: 'unreadable' };
  }
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (asset === undefined) return { kind: 'canceled' };

  let file: File | null = null;
  try {
    file = new File(asset.uri);
    const size = asset.size ?? file.size;
    if (size > MAX_STATEMENT_BYTES) return { kind: 'rejected', reason: 'too_big' };
    const bytes = await file.bytes();
    // The picker size can be absent or stale; the real length decides.
    if (bytes.length > MAX_STATEMENT_BYTES) return { kind: 'rejected', reason: 'too_big' };
    return { kind: 'ok', bytes, mimeType: asset.mimeType ?? null, extension: extensionOf(asset.name) };
  } catch {
    return { kind: 'rejected', reason: 'unreadable' };
  } finally {
    if (file !== null) removeCopy(file);
  }
}
