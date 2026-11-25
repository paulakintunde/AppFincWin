// 10.1-17 (D-09, D-21): own outbox, not the D-27 write queue; 40 files / 150 MB.
// Attaching a receipt saves the file on the phone first; this outbox uploads it when the phone is online and the line exists
// on the server. The list lives in AsyncStorage, the files in the app's document folder, and both are cleared on sign-out.
// This module never logs uris, paths or file names.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager } from '@tanstack/react-query';
import { registerWipeHandler } from '@/services/storage/wipe';
import { RECEIPT_MAX_BYTES } from './limits';
import type { LocalReceiptFile, ReceiptKind, ReceiptMime } from './types';
import type { UploadOutcome } from './upload';

export const OUTBOX_KEY = 'fincwin:receiptOutbox';
export const OUTBOX_DIR = 'receipts-pending/'; // under the app's document folder
export const OUTBOX_MAX_FILES = 40;
export const OUTBOX_MAX_BYTES = 150 * 1024 * 1024;
export const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MINUTES = 60;

export interface OutboxItem {
  receiptId: string;
  groupId: string;
  pageNo: number;
  transactionId: string;
  kind: ReceiptKind;
  mime: ReceiptMime;
  ext: string;
  bytes: number;
  localUri: string;
  attempts: number;
  nextAttemptAt: string | null;
  state: 'waiting' | 'failed';
  createdAt: string;
}

export interface OutboxDeps {
  readList(): Promise<OutboxItem[]>;
  writeList(items: OutboxItem[]): Promise<void>;
  copyIn(src: string, dest: string): Promise<void>;
  remove(uri: string): Promise<void>;
  now(): Date;
  newId(): string;
  isOnline(): boolean;
  uploadOne(item: OutboxItem): Promise<UploadOutcome>;
  /** The folder files are copied into, ending in a slash. */
  dir(): string;
}

export type EnqueueResult = { ok: true; items: OutboxItem[] } | { ok: false; reason: 'outbox_full' | 'too_big' };

export interface DrainResult {
  uploaded: number;
  waiting: number;
  failed: number;
  /** Lines that gained a receipt, so the screen can refresh them. */
  uploadedTransactionIds: string[];
}

// ---- change events (a tiny emitter: local files never go through React Query) ----
const listeners = new Set<() => void>();
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function emit(): void {
  for (const l of Array.from(listeners)) l();
}

// ---- default deps (all native modules are required lazily) ----
function documentDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const base = Paths.document.uri;
  return `${base.endsWith('/') ? base : `${base}/`}${OUTBOX_DIR}`;
}

export function defaultOutboxDeps(): OutboxDeps {
  return {
    readList: async () => {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY);
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
      } catch {
        return [];
      }
    },
    writeList: (items) => AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items)),
    copyIn: async (src, dest) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Directory, File } = require('expo-file-system') as typeof import('expo-file-system');
      const dir = new Directory(documentDir());
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      new File(src).copy(new File(dest));
    },
    remove: async (uri) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      const f = new File(uri);
      if (f.exists) f.delete();
    },
    now: () => new Date(),
    newId: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('expo-crypto') as typeof import('expo-crypto')).randomUUID();
    },
    isOnline: () => onlineManager.isOnline(),
    uploadOne: (item) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('./upload') as typeof import('./upload')).uploadOne(item);
    },
    dir: documentDir,
  };
}

function withDeps(deps?: Partial<OutboxDeps>): OutboxDeps {
  return { ...defaultOutboxDeps(), ...deps };
}

export async function enqueueReceipt(
  input: { transactionId: string; kind: ReceiptKind; files: LocalReceiptFile[] },
  deps?: Partial<OutboxDeps>
): Promise<EnqueueResult> {
  const d = withDeps(deps);
  if (input.files.some((f) => f.bytes > RECEIPT_MAX_BYTES)) return { ok: false, reason: 'too_big' };
  const list = await d.readList();
  const addBytes = input.files.reduce((n, f) => n + f.bytes, 0);
  const haveBytes = list.reduce((n, i) => n + i.bytes, 0);
  if (list.length + input.files.length > OUTBOX_MAX_FILES || haveBytes + addBytes > OUTBOX_MAX_BYTES) {
    return { ok: false, reason: 'outbox_full' };
  }
  const groupId = d.newId();
  const createdAt = d.now().toISOString();
  const made: OutboxItem[] = [];
  try {
    for (const [k, f] of input.files.entries()) {
      const receiptId = d.newId();
      const localUri = `${d.dir()}${receiptId}.${f.ext}`;
      await d.copyIn(f.uri, localUri);
      made.push({
        receiptId,
        groupId,
        pageNo: k + 1,
        transactionId: input.transactionId,
        kind: input.kind,
        mime: f.mime,
        ext: f.ext,
        bytes: f.bytes,
        localUri,
        attempts: 0,
        nextAttemptAt: null,
        state: 'waiting',
        createdAt,
      });
    }
  } catch (e) {
    for (const m of made) await d.remove(m.localUri).catch(() => undefined);
    throw e;
  }
  await d.writeList([...list, ...made]);
  emit();
  return { ok: true, items: made };
}

let inFlight: Promise<DrainResult> | null = null;

function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, MAX_BACKOFF_MINUTES);
}

async function drainOnce(d: OutboxDeps): Promise<DrainResult> {
  const result: DrainResult = { uploaded: 0, waiting: 0, failed: 0, uploadedTransactionIds: [] };
  if (d.isOnline()) {
    const first = await d.readList();
    const ids = first.filter((i) => i.state === 'waiting').map((i) => i.receiptId);
    for (const id of ids) {
      const now = d.now();
      const item = (await d.readList()).find((i) => i.receiptId === id);
      if (!item || item.state !== 'waiting') continue;
      if (item.nextAttemptAt !== null && new Date(item.nextAttemptAt).getTime() > now.getTime()) continue;
      let outcome: UploadOutcome;
      try {
        outcome = await d.uploadOne(item);
      } catch {
        outcome = 'retry';
      }
      const current = await d.readList(); // it may have changed while the upload ran
      const at = current.findIndex((i) => i.receiptId === id);
      if (at === -1) {
        if (outcome === 'uploaded') await d.remove(item.localUri).catch(() => undefined);
        continue;
      }
      const cur = current[at] as OutboxItem;
      if (outcome === 'uploaded') {
        await d.writeList(current.filter((i) => i.receiptId !== id));
        await d.remove(cur.localUri).catch(() => undefined); // only after the row is registered
        result.uploaded += 1;
        result.uploadedTransactionIds.push(cur.transactionId);
      } else if (outcome === 'rejected') {
        await d.writeList(current.map((i) => (i.receiptId === id ? { ...i, state: 'failed' as const } : i)));
      } else if (outcome === 'retry') {
        const attempts = cur.attempts + 1;
        const next: OutboxItem =
          attempts >= MAX_ATTEMPTS
            ? { ...cur, attempts, state: 'failed', nextAttemptAt: null }
            : { ...cur, attempts, nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000).toISOString() };
        await d.writeList(current.map((i) => (i.receiptId === id ? next : i)));
      } // 'line_not_ready': stays waiting, no attempt counted
      emit();
    }
  }
  const after = await d.readList();
  result.waiting = after.filter((i) => i.state === 'waiting').length;
  result.failed = after.filter((i) => i.state === 'failed').length;
  return result;
}

/** One drain at a time; a second call while one runs gets the same answer. */
export function drainOutbox(deps?: Partial<OutboxDeps>): Promise<DrainResult> {
  if (inFlight) return inFlight;
  const d = withDeps(deps);
  inFlight = drainOnce(d).finally(() => {
    inFlight = null;
    emit();
  });
  return inFlight;
}

export async function listOutbox(transactionId?: string, deps?: Partial<OutboxDeps>): Promise<OutboxItem[]> {
  const list = await withDeps(deps).readList();
  return transactionId === undefined ? list : list.filter((i) => i.transactionId === transactionId);
}

export async function removeFromOutbox(groupId: string, deps?: Partial<OutboxDeps>): Promise<void> {
  const d = withDeps(deps);
  const list = await d.readList();
  for (const i of list.filter((x) => x.groupId === groupId)) await d.remove(i.localUri).catch(() => undefined);
  await d.writeList(list.filter((x) => x.groupId !== groupId));
  emit();
}

export async function retryOutboxItem(groupId: string, deps?: Partial<OutboxDeps>): Promise<void> {
  const d = withDeps(deps);
  const list = await d.readList();
  await d.writeList(
    list.map((i) => (i.groupId === groupId && i.state === 'failed' ? { ...i, state: 'waiting' as const, attempts: 0, nextAttemptAt: null } : i))
  );
  emit();
}

/** Sign-out and account deletion: forget the list and delete every pending file. */
export async function wipeOutbox(deps?: Partial<OutboxDeps>): Promise<void> {
  const d = withDeps(deps);
  const list = await d.readList();
  for (const i of list) await d.remove(i.localUri).catch(() => undefined);
  await d.writeList([]);
  emit();
}

registerWipeHandler({
  id: 'receiptOutbox',
  wipe: () => wipeOutbox(),
  pendingWriteCount: async () => (await withDeps().readList()).length, // waiting and failed receipts are unsent work
});
