import { uploadOne, type UploadDeps } from '../upload';
import type { OutboxItem } from '../outbox';

jest.mock('@/services/storage/wipe', () => ({ registerWipeHandler: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));

const mockPath = jest.fn();
const mockAdd = jest.fn();
jest.mock('@/db/receipts', () => ({
  receiptObjectPath: (...a: unknown[]) => mockPath(...a),
  addReceipt: (...a: unknown[]) => mockAdd(...a),
}));

const ITEM: OutboxItem = {
  receiptId: 'r1', groupId: 'g1', pageNo: 1, transactionId: 't1', kind: 'photo', mime: 'image/jpeg', ext: 'jpg', bytes: 10,
  localUri: 'file:///x.jpg', attempts: 0, nextAttemptAt: null, state: 'waiting', createdAt: '2026-11-25T10:00:00Z',
};

function deps(uploadError: unknown = null) {
  const upload = jest.fn().mockResolvedValue({ error: uploadError });
  const d: UploadDeps = {
    client: () => ({ storage: { from: () => ({ upload }) } }) as never,
    readBytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  };
  return { d, upload };
}

beforeEach(() => {
  mockPath.mockReset().mockResolvedValue('h/t1/r1.jpg');
  mockAdd.mockReset().mockResolvedValue({ ok: true });
});

describe('10.1-17 uploadOne', () => {
  it('uploads then registers', async () => {
    const { d, upload } = deps();
    expect(await uploadOne(ITEM, d)).toBe('uploaded');
    expect(upload).toHaveBeenCalledWith('h/t1/r1.jpg', expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: false });
    expect(mockAdd).toHaveBeenCalledWith(expect.anything(), { id: 'r1', transactionId: 't1', groupId: 'g1', pageNo: 1, kind: 'photo', mime: 'image/jpeg', bytes: 10 });
  });
  it('a 409 from storage (a lost reply earlier) still registers and counts as uploaded', async () => {
    const { d } = deps({ statusCode: '409' });
    expect(await uploadOne(ITEM, d)).toBe('uploaded');
    expect(mockAdd).toHaveBeenCalled();
  });
  it('no storage path yet means the line is not on the server', async () => {
    mockPath.mockResolvedValue(null);
    const { d, upload } = deps();
    expect(await uploadOne(ITEM, d)).toBe('line_not_ready');
    expect(upload).not.toHaveBeenCalled();
  });
  it('other storage errors and object_missing retry', async () => {
    expect(await uploadOne(ITEM, deps({ statusCode: '500' }).d)).toBe('retry');
    mockAdd.mockResolvedValue({ ok: false, reason: 'object_missing' });
    expect(await uploadOne(ITEM, deps().d)).toBe('retry');
  });
  it('limit refusals are rejected', async () => {
    for (const reason of ['too_many_receipts', 'too_many_pages', 'too_big', 'bad_type', 'not_found']) {
      mockAdd.mockResolvedValue({ ok: false, reason });
      expect(await uploadOne(ITEM, deps().d)).toBe('rejected');
    }
  });
  it('a network error retries; a missing local file is rejected', async () => {
    mockPath.mockRejectedValue(new Error('offline'));
    expect(await uploadOne(ITEM, deps().d)).toBe('retry');
    mockPath.mockResolvedValue('p');
    const { d } = deps();
    (d.readBytes as jest.Mock).mockRejectedValue(new Error('gone'));
    expect(await uploadOne(ITEM, d)).toBe('rejected');
  });
});
