// 10.1-22 (D-08, RCP-06): the data export's receipt files. Every receipt the user can see (RLS) is fetched with their own session
// and packed into ZIP files with a receipts.csv that maps each file to its line. ZIPs are written chunk by chunk (fflate's
// streaming Zip with ZipPassThrough, since photos and PDFs are already compressed) and split near 100 MB, so no whole ZIP is
// ever held in memory. Temp files are removed after sharing and on every failure. This module never logs paths or file names.
import { strToU8, Zip, ZipPassThrough } from 'fflate';
import { toCsv } from '@/features/export/csvSerialize';
import { RECEIPT_COLUMNS, type ReceiptRow } from '@/db/receipts';
import type { DbClient } from '@/db/rows';
import { RECEIPT_BUCKET } from './upload';

export const RECEIPT_ZIP_MAX_BYTES = 100 * 1024 * 1024;

export const RECEIPTS_CSV_COLUMNS = [
  'receipt_id',
  'group_id',
  'page_no',
  'line_id',
  'line_date',
  'line_name',
  'kind',
  'mime_type',
  'bytes',
  'file_in_zip',
  'zip_name',
] as const;

export type ExportReceiptRow = ReceiptRow & { line_name: string | null; local_date: string };

export interface ExportReceiptDeps {
  listAllReceipts(): Promise<ExportReceiptRow[]>;
  download(path: string): Promise<Uint8Array | null>;
  writeChunk(file: string, chunk: Uint8Array): Promise<void>;
  share(files: string[]): Promise<'shared' | 'cancelled'>;
  removeTemp(files: string[]): Promise<void>;
  tempDir(): string;
}

export type ExportReceiptsResult =
  | { ok: true; files: number; zips: number; missing: number }
  | { ok: false; reason: 'none' | 'offline' | 'failed' | 'cancelled' };

const PAGE = 1000;
const LINE_CHUNK = 100;
const COPY_CHUNK = 4 * 1024 * 1024;
const EXPORT_DIR = 'receipt-export';

function lazySupabase(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase as unknown as DbClient;
}

type FileSystem = typeof import('expo-file-system');
function fs(): FileSystem {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system') as FileSystem;
}

async function listAll(): Promise<ExportReceiptRow[]> {
  const client = lazySupabase();
  const receipts: ReceiptRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('transaction_receipts')
      .select(RECEIPT_COLUMNS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data as ReceiptRow[] | null) ?? [];
    receipts.push(...page);
    if (page.length < PAGE) break;
  }
  const lines = new Map<string, { name: string | null; local_date: string }>();
  const ids = [...new Set(receipts.map((r) => r.transaction_id))];
  for (let i = 0; i < ids.length; i += LINE_CHUNK) {
    const { data, error } = await client.from('transactions_active').select('id, name, local_date').in('id', ids.slice(i, i + LINE_CHUNK));
    if (error) throw error;
    for (const l of (data as { id: string; name: string | null; local_date: string }[] | null) ?? []) {
      lines.set(l.id, { name: l.name, local_date: l.local_date });
    }
  }
  // A line this view no longer shows (removed) still has its file: dated by when the file was added.
  return receipts.map((r) => ({
    ...r,
    line_name: lines.get(r.transaction_id)?.name ?? null,
    local_date: lines.get(r.transaction_id)?.local_date ?? r.created_at.slice(0, 10),
  }));
}

export function defaultExportReceiptDeps(): ExportReceiptDeps {
  return {
    listAllReceipts: listAll,
    download: async (path) => {
      try {
        const { data, error } = await lazySupabase().storage.from(RECEIPT_BUCKET).download(path);
        if (error || !data) return null;
        return new Uint8Array(await (data as Blob).arrayBuffer());
      } catch {
        return null;
      }
    },
    writeChunk: async (file, chunk) => {
      const { File, FileMode } = fs();
      const f = new File(file);
      if (!f.exists) f.create();
      const handle = f.open(FileMode.Append);
      try {
        handle.writeBytes(chunk);
      } finally {
        handle.close();
      }
    },
    share: async (files) => {
      const { Directory, File, FileMode } = fs();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Platform, Share } = require('react-native') as typeof import('react-native');
      if (Platform.OS === 'android') {
        let target: InstanceType<typeof Directory>;
        try {
          target = await Directory.pickDirectoryAsync();
        } catch {
          return 'cancelled';
        }
        for (const path of files) {
          const src = new File(path);
          const dst = target.createFile(path.slice(path.lastIndexOf('/') + 1).replace(/\.zip$/, ''), 'application/zip');
          const read = src.open(FileMode.ReadOnly);
          const write = dst.open(FileMode.Append);
          try {
            for (let left = src.size ?? 0; left > 0; ) {
              const n = Math.min(COPY_CHUNK, left);
              write.writeBytes(read.readBytes(n));
              left -= n;
            }
          } finally {
            read.close();
            write.close();
          }
        }
        return 'shared';
      }
      for (const path of files) {
        const result = await Share.share({ url: new File(path).uri });
        if (result.action === Share.dismissedAction) return 'cancelled';
      }
      return 'shared';
    },
    removeTemp: async (files) => {
      const { Directory, File } = fs();
      for (const path of files) {
        try {
          const f = new File(path);
          if (f.exists) f.delete();
        } catch {
          // the cache is cleared by the system anyway
        }
      }
      try {
        const dir = new Directory(fs().Paths.cache, EXPORT_DIR);
        if (dir.exists) dir.delete();
      } catch {
        // as above
      }
    },
    tempDir: () => {
      const { Directory, Paths } = fs();
      const dir = new Directory(Paths.cache, EXPORT_DIR);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const uri = dir.uri;
      return uri.endsWith('/') ? uri.slice(0, -1) : uri;
    },
  };
}

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

function extOf(r: ExportReceiptRow): string {
  const known = EXT_BY_MIME[r.mime_type];
  if (known) return known;
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(r.object_path);
  return m ? m[1]!.toLowerCase() : 'bin';
}

/** `<line_date>_<line_id first 8>_<group_id first 8>_p<page_no>.<ext>` */
export function receiptFileName(r: ExportReceiptRow): string {
  return `${r.local_date}_${r.transaction_id.slice(0, 8)}_${r.group_id.slice(0, 8)}_p${r.page_no}.${extOf(r)}`;
}

function looksOffline(e: unknown): boolean {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : '';
  return /network|fetch|offline|timed? ?out|failed to connect/i.test(text);
}

interface OpenZip {
  name: string;
  path: string;
  zip: Zip;
  bytes: number;
  ended: boolean;
  /** Writes are chained so chunks reach the file in order. */
  chain: Promise<void>;
  failed: unknown;
}

export async function exportReceiptFiles(deps: Partial<ExportReceiptDeps> = {}): Promise<ExportReceiptsResult> {
  const d: ExportReceiptDeps = { ...defaultExportReceiptDeps(), ...deps };
  const temp: string[] = [];
  try {
    let rows: ExportReceiptRow[];
    try {
      rows = await d.listAllReceipts();
    } catch (e) {
      return { ok: false, reason: looksOffline(e) ? 'offline' : 'failed' };
    }
    if (rows.length === 0) return { ok: false, reason: 'none' };

    const dir = d.tempDir();
    const zips: OpenZip[] = [];
    const openZip = (): OpenZip => {
      const name = `fincwin-receipts-${zips.length + 1}.zip`;
      const path = `${dir}/${name}`;
      const z: OpenZip = { name, path, zip: new Zip(), bytes: 0, ended: false, chain: Promise.resolve(), failed: null };
      z.zip.ondata = (err, chunk) => {
        if (err) {
          z.failed = err;
          return;
        }
        // The chunk is copied: fflate may reuse its buffer after the callback returns.
        const copy = chunk.slice();
        z.chain = z.chain.then(() => d.writeChunk(path, copy));
      };
      temp.push(path);
      zips.push(z);
      return z;
    };
    const flush = async (z: OpenZip): Promise<void> => {
      await z.chain;
      if (z.failed) throw z.failed;
    };
    const endZip = async (z: OpenZip): Promise<void> => {
      if (z.ended) return;
      z.ended = true;
      z.zip.end();
      await flush(z);
    };

    const csvRows: Record<string, unknown>[] = [];
    let files = 0;
    let missing = 0;
    let current: OpenZip | null = null;

    for (const r of rows) {
      const data = await d.download(r.object_path);
      const base = {
        receipt_id: r.id,
        group_id: r.group_id,
        page_no: r.page_no,
        line_id: r.transaction_id,
        line_date: r.local_date,
        line_name: r.line_name,
        kind: r.kind,
        mime_type: r.mime_type,
        bytes: r.bytes,
      };
      if (data === null) {
        missing += 1;
        csvRows.push({ ...base, file_in_zip: '', zip_name: '' });
        continue;
      }
      if (current === null || current.bytes >= RECEIPT_ZIP_MAX_BYTES) {
        // The first ZIP stays open until the end: it also carries receipts.csv, which is only known then.
        if (current !== null && zips.length > 1) await endZip(current);
        current = openZip();
      }
      const fileName = receiptFileName(r);
      const entry = new ZipPassThrough(fileName);
      current.zip.add(entry);
      entry.push(data, true);
      current.bytes += data.byteLength;
      await flush(current);
      files += 1;
      csvRows.push({ ...base, file_in_zip: fileName, zip_name: current.name });
    }

    if (files === 0) return { ok: false, reason: 'offline' };

    const first = zips[0]!;
    const csv = new ZipPassThrough('receipts.csv');
    first.zip.add(csv);
    csv.push(strToU8(toCsv(RECEIPTS_CSV_COLUMNS, csvRows)), true);
    for (const z of zips) await endZip(z);

    const shared = await d.share(zips.map((z) => z.path));
    if (shared === 'cancelled') return { ok: false, reason: 'cancelled' };
    return { ok: true, files, zips: zips.length, missing };
  } catch {
    return { ok: false, reason: 'failed' };
  } finally {
    await d.removeTemp(temp).catch(() => undefined);
  }
}
