// 10.1-25 (T-10.1-25-01): cache copies for reading, and their clean-up.
import { copiesForReading, discardFiles } from '../scanFiles';

jest.mock('@/services/receipts/openReceipt', () => ({ defaultOpenReceiptDeps: () => ({ download: jest.fn() }) }));
jest.mock('@/services/receipts/outbox', () => ({ defaultOutboxDeps: () => ({ remove: jest.fn(async () => undefined) }) }));

describe('copiesForReading', () => {
  it('downloads signed links to the cache, keeps local files as they are and returns only the downloads as temps', async () => {
    const download = jest.fn(async (_url: string, name: string) => `file:///cache/receipt-view/${name}`);
    const res = await copiesForReading(
      [
        { uri: 'https://signed.example/a', mime: 'image/png' },
        { uri: 'file:///docs/outbox/b.jpg', mime: 'image/jpeg' },
      ],
      { download },
    );
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![1]).toMatch(/^read-\d+-\d+\.png$/);
    expect(res.images).toHaveLength(2);
    expect(res.images[0]!.uri).toMatch(/^file:\/\/\/cache\/receipt-view\/read-/);
    expect(res.images[1]).toEqual({ uri: 'file:///docs/outbox/b.jpg', mime: 'image/jpeg' });
    expect(res.temps).toEqual([res.images[0]!.uri]);
  });

  it('leaves out a page that does not download', async () => {
    const download = jest.fn(async () => {
      throw new Error('offline');
    });
    const res = await copiesForReading([{ uri: 'https://signed.example/a', mime: 'image/jpeg' }], { download });
    expect(res).toEqual({ images: [], temps: [] });
  });
});

describe('discardFiles', () => {
  it('deletes each file and swallows failures', async () => {
    const remove = jest.fn(async (uri: string) => {
      if (uri.endsWith('2')) throw new Error('gone');
    });
    discardFiles(['file:///c/1', 'file:///c/2'], remove);
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
