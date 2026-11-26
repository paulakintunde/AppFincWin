// 10.1-22 (D-08, RCP-06): receipt files packed in streaming ZIPs with a mapping CSV.
import { strFromU8, unzipSync } from 'fflate';
import { exportReceiptFiles, RECEIPT_ZIP_MAX_BYTES, receiptFileName, type ExportReceiptDeps, type ExportReceiptRow } from '../exportReceipts';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

function receipt(n: number, over: Partial<ExportReceiptRow> = {}): ExportReceiptRow {
  return {
    id: `r${n}`,
    transaction_id: `aaaaaaaa-0000-0000-0000-00000000000${n % 2}`,
    household_id: 'h1',
    group_id: `${n}bbbbbbb-0000-0000-0000-000000000000`,
    page_no: 1,
    uploaded_by: 'u1',
    object_path: `h1/line/r${n}.jpg`,
    kind: 'photo',
    mime_type: 'image/jpeg',
    bytes: 10,
    created_at: '2026-11-20T10:00:00Z',
    line_name: n === 1 ? '=Shop, "big"' : 'Cafe',
    local_date: '2026-11-18',
    ...over,
  };
}

interface Fake {
  deps: ExportReceiptDeps;
  files: Map<string, Uint8Array[]>;
  shared: string[][];
  removed: string[][];
}

function fake(rows: ExportReceiptRow[], over: Partial<ExportReceiptDeps> = {}, size = (): number => 10): Fake {
  const files = new Map<string, Uint8Array[]>();
  const shared: string[][] = [];
  const removed: string[][] = [];
  const deps: ExportReceiptDeps = {
    listAllReceipts: async () => rows,
    download: async (p) => new Uint8Array(size()).fill(p.length % 255),
    writeChunk: async (file, chunk) => {
      files.set(file, [...(files.get(file) ?? []), chunk]);
    },
    share: async (f) => {
      shared.push(f);
      return 'shared';
    },
    removeTemp: async (f) => {
      removed.push(f);
    },
    tempDir: () => '/tmp/x',
    ...over,
  };
  return { deps, files, shared, removed };
}

function unzip(f: Fake, path: string): Record<string, Uint8Array> {
  const parts = f.files.get(path) ?? [];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return unzipSync(all);
}

describe('exportReceiptFiles', () => {
  it('packs three receipts of two lines in one ZIP with receipts.csv', async () => {
    const rows = [receipt(1), receipt(2), receipt(3)];
    const f = fake(rows);
    const out = await exportReceiptFiles(f.deps);
    expect(out).toEqual({ ok: true, files: 3, zips: 1, missing: 0 });
    const z = unzip(f, '/tmp/x/fincwin-receipts-1.zip');
    expect(Object.keys(z).sort()).toEqual([...rows.map(receiptFileName), 'receipts.csv'].sort());
    expect(receiptFileName(rows[0]!)).toBe('2026-11-18_aaaaaaaa_1bbbbbbb_p1.jpg');
    const csv = strFromU8(z['receipts.csv']!);
    expect(csv.split('\r\n')[0]).toBe('receipt_id,group_id,page_no,line_id,line_date,line_name,kind,mime_type,bytes,file_in_zip,zip_name');
    expect(csv).toContain('fincwin-receipts-1.zip');
    // a spreadsheet formula in a line name is defused and the quotes are escaped
    expect(csv).toContain(`"'=Shop, ""big"""`);
    expect(f.shared).toEqual([['/tmp/x/fincwin-receipts-1.zip']]);
  });

  it('keeps the file bytes exactly', async () => {
    const f = fake([receipt(1)], { download: async () => new Uint8Array([1, 2, 3, 4, 5]) });
    await exportReceiptFiles(f.deps);
    const z = unzip(f, '/tmp/x/fincwin-receipts-1.zip');
    expect(Array.from(z[receiptFileName(receipt(1))]!)).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts a second ZIP past the cap; receipts.csv stays in the first', async () => {
    const big = Math.floor(RECEIPT_ZIP_MAX_BYTES / 2) + 1;
    const rows = [receipt(1), receipt(2), receipt(3)];
    const f = fake(rows, {}, () => big);
    const out = await exportReceiptFiles(f.deps);
    expect(out).toEqual({ ok: true, files: 3, zips: 2, missing: 0 });
    const first = unzip(f, '/tmp/x/fincwin-receipts-1.zip');
    const second = unzip(f, '/tmp/x/fincwin-receipts-2.zip');
    expect(Object.keys(first)).toContain('receipts.csv');
    expect(Object.keys(second)).not.toContain('receipts.csv');
    expect(Object.keys(first).length - 1 + Object.keys(second).length).toBe(3);
    expect(strFromU8(first['receipts.csv']!)).toContain('fincwin-receipts-2.zip');
    expect(f.shared[0]).toEqual(['/tmp/x/fincwin-receipts-1.zip', '/tmp/x/fincwin-receipts-2.zip']);
  }, 60000);

  it('counts a failed download as missing and leaves file_in_zip empty', async () => {
    const f = fake([receipt(1), receipt(2)], { download: async (p) => (p.includes('r2') ? null : new Uint8Array(5)) });
    const out = await exportReceiptFiles(f.deps);
    expect(out).toEqual({ ok: true, files: 1, zips: 1, missing: 1 });
    const csv = strFromU8(unzip(f, '/tmp/x/fincwin-receipts-1.zip')['receipts.csv']!);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]!.endsWith(',,')).toBe(true);
  });

  it('reports none, offline and failed', async () => {
    expect(await exportReceiptFiles(fake([]).deps)).toEqual({ ok: false, reason: 'none' });
    const offline = fake([receipt(1)], {
      listAllReceipts: async () => {
        throw new TypeError('Network request failed');
      },
    });
    expect(await exportReceiptFiles(offline.deps)).toEqual({ ok: false, reason: 'offline' });
    const failed = fake([receipt(1)], {
      listAllReceipts: async () => {
        throw new Error('boom');
      },
    });
    expect(await exportReceiptFiles(failed.deps)).toEqual({ ok: false, reason: 'failed' });
    const noneFetched = fake([receipt(1)], { download: async () => null });
    expect(await exportReceiptFiles(noneFetched.deps)).toEqual({ ok: false, reason: 'offline' });
    expect(noneFetched.shared).toEqual([]);
  });

  it('a cancelled share removes the temp files', async () => {
    const f = fake([receipt(1)], { share: async () => 'cancelled' });
    expect(await exportReceiptFiles(f.deps)).toEqual({ ok: false, reason: 'cancelled' });
    expect(f.removed).toEqual([['/tmp/x/fincwin-receipts-1.zip']]);
  });

  it('removes temp files after a successful share and after a write failure', async () => {
    const ok = fake([receipt(1)]);
    await exportReceiptFiles(ok.deps);
    expect(ok.removed).toEqual([['/tmp/x/fincwin-receipts-1.zip']]);
    const bad = fake([receipt(1)], {
      writeChunk: async () => {
        throw new Error('disk full');
      },
    });
    expect(await exportReceiptFiles(bad.deps)).toEqual({ ok: false, reason: 'failed' });
    expect(bad.removed).toHaveLength(1);
    expect(bad.shared).toEqual([]);
  });

  it('names a non-standard mime by the stored path extension, else bin', () => {
    expect(receiptFileName(receipt(1, { mime_type: 'application/pdf' }))).toMatch(/\.pdf$/);
    expect(receiptFileName(receipt(1, { mime_type: 'x/y', object_path: 'a/b.HEIC' }))).toMatch(/\.heic$/);
    expect(receiptFileName(receipt(1, { mime_type: 'x/y', object_path: 'a/b' }))).toMatch(/\.bin$/);
  });
});
