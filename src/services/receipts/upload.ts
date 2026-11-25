// 10.1-17 (D-09, RCP-01): one receipt page goes to the server in two steps, upload then register, and a repeat is harmless.
// The storage path comes from the server (receipt_object_path), the file is uploaded once (a 409 means an earlier try already
// landed it) and add_receipt is idempotent on the receipt id ('already'). This module never logs paths or file names.
import { addReceipt, receiptObjectPath } from '@/db/receipts';
import type { DbClient } from '@/db/rows';
import type { OutboxItem } from './outbox';

export type UploadOutcome = 'uploaded' | 'line_not_ready' | 'retry' | 'rejected';

export interface UploadDeps {
  client(): DbClient;
  readBytes(uri: string): Promise<Uint8Array>;
}

export const RECEIPT_BUCKET = 'receipts';

// Lazy so importing this module never reads env vars (client.ts reads them at load); tests never need them.
function lazySupabase(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase as unknown as DbClient;
}

export function defaultUploadDeps(): UploadDeps {
  return {
    client: lazySupabase,
    readBytes: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      return new File(uri).bytes();
    },
  };
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  for (const key of ['statusCode', 'status']) {
    const raw = (error as Record<string, unknown>)[key];
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  }
  return null;
}

const REJECTED_REASONS = new Set(['too_many_receipts', 'too_many_pages', 'too_big', 'bad_type', 'not_found']);

export async function uploadOne(item: OutboxItem, deps: Partial<UploadDeps> = {}): Promise<UploadOutcome> {
  const d: UploadDeps = { ...defaultUploadDeps(), ...deps };
  try {
    const client = d.client();
    const path = await receiptObjectPath(client, item.receiptId, item.transactionId, item.mime);
    if (path === null) return 'line_not_ready';

    let bytes: Uint8Array;
    try {
      bytes = await d.readBytes(item.localUri);
    } catch {
      return 'rejected'; // the local file is gone: nothing to retry
    }
    const { error } = await client.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: item.mime, upsert: false });
    if (error && statusOf(error) !== 409) return 'retry';

    const res = await addReceipt(client, {
      id: item.receiptId,
      transactionId: item.transactionId,
      groupId: item.groupId,
      pageNo: item.pageNo,
      kind: item.kind,
      mime: item.mime,
      bytes: item.bytes,
    });
    if (res.ok) return 'uploaded';
    return REJECTED_REASONS.has(res.reason) ? 'rejected' : 'retry';
  } catch {
    return 'retry';
  }
}
