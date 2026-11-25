import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerWipeHandler } from '@/services/storage/wipe';
import {
  MAX_ATTEMPTS,
  OUTBOX_MAX_BYTES,
  OUTBOX_MAX_FILES,
  drainOutbox,
  enqueueReceipt,
  listOutbox,
  removeFromOutbox,
  retryOutboxItem,
  subscribeOutbox,
  type OutboxDeps,
  type OutboxItem,
} from '../outbox';
import type { LocalReceiptFile, UploadOutcome } from '../types';

jest.mock('@/services/storage/wipe', () => ({ registerWipeHandler: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));


// the wipe handler is registered at import time, before any test clears the mock
const wipeHandler = (registerWipeHandler as jest.Mock).mock.calls[0]?.[0] as { id: string; wipe(): Promise<void>; pendingWriteCount(): Promise<number> };

function file(n: number, bytes = 1000): LocalReceiptFile {
  return { uri: `file:///cache/p${n}.jpg`, mime: 'image/jpeg', ext: 'jpg', bytes, width: 10, height: 10 };
}

function harness(over: Partial<OutboxDeps> = {}) {
  let list: OutboxItem[] = [];
  const files = new Set<string>();
  let clock = new Date('2026-11-25T10:00:00Z').getTime();
  let n = 0;
  const outcomes: UploadOutcome[] = [];
  const deps: OutboxDeps = {
    readList: async () => JSON.parse(JSON.stringify(list)) as OutboxItem[],
    writeList: async (items) => {
      list = JSON.parse(JSON.stringify(items)) as OutboxItem[];
    },
    copyIn: async (_src, dest) => {
      files.add(dest);
    },
    remove: async (uri) => {
      files.delete(uri);
    },
    now: () => new Date(clock),
    newId: () => `id-${++n}`,
    isOnline: () => true,
    uploadOne: jest.fn(async () => outcomes.shift() ?? 'uploaded'),
    dir: () => 'file:///docs/receipts-pending/',
    ...over,
  };
  return {
    deps,
    files,
    outcomes,
    get list() {
      return list;
    },
    set list(v: OutboxItem[]) {
      list = v;
    },
    advanceMinutes: (m: number) => {
      clock += m * 60_000;
    },
  };
}

describe('10.1-17 receipt outbox', () => {
  it('registers a wipe handler that counts waiting and failed receipts and clears the list and files', async () => {
    expect(wipeHandler.id).toBe('receiptOutbox');
    const store = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };
    const item = { receiptId: 'r', groupId: 'g', localUri: 'file:///nowhere.jpg', state: 'failed' };
    store.getItem.mockResolvedValue(JSON.stringify([item, { ...item, receiptId: 'r2', state: 'waiting' }]));
    expect(await wipeHandler.pendingWriteCount()).toBe(2);
    jest.doMock('expo-file-system', () => ({ File: class { exists = false; }, Paths: { document: { uri: 'file:///d/' } } }));
    await wipeHandler.wipe();
    expect(store.setItem).toHaveBeenCalledWith('fincwin:receiptOutbox', '[]');
  });

  it('enqueue copies each page, shares one group id and numbers pages from 1', async () => {
    const h = harness();
    const r = await enqueueReceipt({ transactionId: 't1', kind: 'scan', files: [file(1), file(2)] }, h.deps);
    expect(r.ok).toBe(true);
    expect(h.list).toHaveLength(2);
    expect(new Set(h.list.map((i) => i.groupId)).size).toBe(1);
    expect(h.list.map((i) => i.pageNo)).toEqual([1, 2]);
    expect(h.list.every((i) => i.state === 'waiting' && i.attempts === 0)).toBe(true);
    expect(h.files.size).toBe(2);
    expect([...h.files][0]).toMatch(/^file:\/\/\/docs\/receipts-pending\/id-\d+\.jpg$/);
  });

  it('refuses a 41st file, more than 150 MB, and a file over the per-file limit', async () => {
    const h = harness();
    for (let k = 0; k < OUTBOX_MAX_FILES; k += 1) await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(k)] }, h.deps);
    expect(await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(99)] }, h.deps)).toEqual({ ok: false, reason: 'outbox_full' });
    const h2 = harness();
    h2.list = [{ ...({} as OutboxItem), bytes: OUTBOX_MAX_BYTES - 10, receiptId: 'x', groupId: 'g' }];
    expect(await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1, 100)] }, h2.deps)).toEqual({ ok: false, reason: 'outbox_full' });
    expect(await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1, 6 * 1024 * 1024)] }, harness().deps)).toEqual({ ok: false, reason: 'too_big' });
  });

  it('a failed copy leaves nothing behind', async () => {
    const h = harness();
    let calls = 0;
    h.deps.copyIn = async (_s, dest) => {
      calls += 1;
      if (calls === 2) throw new Error('disk full');
      h.files.add(dest);
    };
    await expect(enqueueReceipt({ transactionId: 't', kind: 'scan', files: [file(1), file(2)] }, h.deps)).rejects.toThrow('disk full');
    expect(h.files.size).toBe(0);
    expect(h.list).toHaveLength(0);
  });

  it('drain does nothing offline', async () => {
    const h = harness({ isOnline: () => false });
    await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1)] }, h.deps);
    const r = await drainOutbox(h.deps);
    expect(r).toEqual({ uploaded: 0, waiting: 1, failed: 0, uploadedTransactionIds: [] });
    expect(h.deps.uploadOne).not.toHaveBeenCalled();
  });

  it('uploaded removes the item and deletes the local file only afterwards', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 't9', kind: 'photo', files: [file(1)] }, h.deps);
    const order: string[] = [];
    const removeOrig = h.deps.remove;
    h.deps.remove = async (u) => {
      order.push(`remove:${h.list.length}`);
      await removeOrig(u);
    };
    const r = await drainOutbox(h.deps);
    expect(r.uploaded).toBe(1);
    expect(r.uploadedTransactionIds).toEqual(['t9']);
    expect(h.list).toHaveLength(0);
    expect(h.files.size).toBe(0);
    expect(order).toEqual(['remove:0']); // the list no longer holds it when the file goes
  });

  it('line_not_ready keeps it waiting without counting an attempt', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1)] }, h.deps);
    h.outcomes.push('line_not_ready');
    await drainOutbox(h.deps);
    expect(h.list[0]).toMatchObject({ state: 'waiting', attempts: 0, nextAttemptAt: null });
    expect(h.files.size).toBe(1);
  });

  it('retry backs off, skips the item until its time, and the 5th retry marks it failed', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1)] }, h.deps);
    h.outcomes.push('retry');
    await drainOutbox(h.deps);
    expect(h.list[0]?.attempts).toBe(1);
    expect(h.list[0]?.nextAttemptAt).toBe('2026-11-25T10:02:00.000Z'); // 2^1 minutes
    h.outcomes.push('retry');
    await drainOutbox(h.deps); // too early: skipped
    expect(h.deps.uploadOne).toHaveBeenCalledTimes(1);
    for (let k = 2; k <= MAX_ATTEMPTS; k += 1) {
      h.advanceMinutes(61);
      h.outcomes.push('retry');
      await drainOutbox(h.deps);
    }
    expect(h.list[0]).toMatchObject({ state: 'failed', attempts: MAX_ATTEMPTS });
    expect(h.files.size).toBe(1); // the file stays so it can be retried
  });

  it('rejected moves the item to failed at once; retry puts it back; remove deletes its files', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 't', kind: 'scan', files: [file(1), file(2)] }, h.deps);
    h.outcomes.push('rejected', 'rejected');
    const r = await drainOutbox(h.deps);
    expect(r.failed).toBe(2);
    const group = h.list[0]?.groupId as string;
    await retryOutboxItem(group, h.deps);
    expect(h.list.every((i) => i.state === 'waiting' && i.attempts === 0)).toBe(true);
    await removeFromOutbox(group, h.deps);
    expect(h.list).toHaveLength(0);
    expect(h.files.size).toBe(0);
  });

  it('two drains at once run one upload per item', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1)] }, h.deps);
    const [a, b] = await Promise.all([drainOutbox(h.deps), drainOutbox(h.deps)]);
    expect(h.deps.uploadOne).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('the list survives a restart and can be filtered by line', async () => {
    const h = harness();
    await enqueueReceipt({ transactionId: 'a', kind: 'photo', files: [file(1)] }, h.deps);
    await enqueueReceipt({ transactionId: 'b', kind: 'photo', files: [file(2)] }, h.deps);
    expect((await listOutbox(undefined, h.deps)).length).toBe(2);
    expect((await listOutbox('b', h.deps)).map((i) => i.transactionId)).toEqual(['b']);
  });

  it('notifies subscribers when the list changes', async () => {
    const h = harness();
    const seen = jest.fn();
    const off = subscribeOutbox(seen);
    await enqueueReceipt({ transactionId: 'a', kind: 'photo', files: [file(1)] }, h.deps);
    expect(seen).toHaveBeenCalled();
    off();
  });

  it('a throwing upload counts as a retry', async () => {
    const h = harness({ uploadOne: jest.fn(async () => { throw new Error('boom'); }) });
    await enqueueReceipt({ transactionId: 't', kind: 'photo', files: [file(1)] }, h.deps);
    await drainOutbox(h.deps);
    expect(h.list[0]?.attempts).toBe(1);
  });
});
