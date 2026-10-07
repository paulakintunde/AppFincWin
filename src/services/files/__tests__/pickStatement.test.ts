import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MAX_STATEMENT_BYTES, STATEMENT_MIME_TYPES, pickStatementBytes } from '../pickStatement';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const mockDelete = jest.fn();
const mockBytes = jest.fn();
let mockFileSize = 10;

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    get size() {
      return mockFileSize;
    },
    bytes: (...args: unknown[]) => mockBytes(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  })),
}));

const pick = getDocumentAsync as jest.Mock;

function asset(over: Partial<{ uri: string; name: string; size: number | undefined; mimeType: string | undefined }> = {}) {
  return { uri: 'file:///cache/stmt.csv', name: 'Statement 12345678.csv', size: 10, mimeType: 'text/csv', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSize = 10;
  mockDelete.mockReset();
  mockBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

describe('pickStatementBytes', () => {
  it('returns canceled and touches no file when the picker is canceled', async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'canceled' });
    expect(File).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('treats a result with no assets as canceled', async () => {
    pick.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'canceled' });
  });

  it('reads bytes, derives the extension, never returns the file name, and deletes the cache copy', async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset()] });
    const result = await pickStatementBytes();
    expect(result).toEqual({ kind: 'ok', bytes: new Uint8Array([1, 2, 3]), mimeType: 'text/csv', extension: 'csv' });
    expect(Object.keys(result)).not.toContain('name');
    expect(JSON.stringify(result)).not.toContain('12345678');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a.OFX', 'ofx'],
    ['a.qfx', 'qfx'],
    ['a.txt', 'other'],
    ['noextension', 'other'],
  ])('maps %s to extension %s', async (name, extension) => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ name, mimeType: undefined })] });
    const result = await pickStatementBytes();
    expect(result).toMatchObject({ kind: 'ok', extension, mimeType: null });
  });

  it('rejects too_big on the picker size, without reading, and still deletes the copy', async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ size: MAX_STATEMENT_BYTES + 1 })] });
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'rejected', reason: 'too_big' });
    expect(mockBytes).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('falls back to the file size when the picker gives none, and rejects too_big', async () => {
    mockFileSize = MAX_STATEMENT_BYTES + 5;
    pick.mockResolvedValue({ canceled: false, assets: [asset({ size: undefined })] });
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'rejected', reason: 'too_big' });
    expect(mockBytes).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('accepts a file of exactly the cap', async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ size: MAX_STATEMENT_BYTES })] });
    await expect(pickStatementBytes()).resolves.toMatchObject({ kind: 'ok' });
  });

  it('rejects unreadable when the read fails, and deletes the copy', async () => {
    mockBytes.mockRejectedValue(new Error('boom 12345678'));
    pick.mockResolvedValue({ canceled: false, assets: [asset()] });
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'rejected', reason: 'unreadable' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('rejects unreadable when the picker itself throws', async () => {
    pick.mockRejectedValue(new Error('picker'));
    await expect(pickStatementBytes()).resolves.toEqual({ kind: 'rejected', reason: 'unreadable' });
  });

  it('survives a failing delete', async () => {
    mockDelete.mockImplementation(() => {
      throw new Error('cannot delete');
    });
    pick.mockResolvedValue({ canceled: false, assets: [asset()] });
    await expect(pickStatementBytes()).resolves.toMatchObject({ kind: 'ok' });
  });

  it('asks for the documented types with */* last, one file, copied to cache', async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    await pickStatementBytes();
    expect(pick).toHaveBeenCalledWith({ type: [...STATEMENT_MIME_TYPES], copyToCacheDirectory: true, multiple: false });
    expect(STATEMENT_MIME_TYPES[STATEMENT_MIME_TYPES.length - 1]).toBe('*/*');
    expect(STATEMENT_MIME_TYPES).toContain('application/x-ofx');
    expect(STATEMENT_MIME_TYPES).toHaveLength(10);
  });
});
