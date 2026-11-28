// 10-review-2 (D-4, owner 2026-11-28): Android asks for the folder before reading anything; nothing partial is left.
import { Platform, Share } from 'react-native';
import { exportCsv, type ExportProgress } from '../csvExport';
import type { DbClient } from '@/db/rows';

const mockPick = jest.fn();
const mockCreated: { name: string; text: string; deleted: boolean }[] = [];
let mockFailWriteAt = -1;

jest.mock('expo-file-system', () => {
  class MockFile {
    uri = 'file://x';
    exists = false;
    create() {}
    write() {}
  }
  class MockDirectory {
    exists = false;
    create() {}
    delete() {}
    static pickDirectoryAsync = () => mockPick();
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: 'cache' } };
});
jest.mock('@/data/sync/lockedWrites', () => ({ getLockedWrites: () => [] }));
jest.mock('@/services/lock/externalActivity', () => ({ withExternalActivity: (fn: () => unknown) => fn() }));

const reads: string[] = [];
function client(fail?: string): DbClient {
  const chain = (table: string) => {
    const q = {
      gte: () => q,
      lt: () => q,
      range: async () => {
        reads.push(table);
        return table === fail ? { data: null, error: new Error('boom') } : { data: [], error: null };
      },
    };
    return q;
  };
  return {
    from: (table: string) => ({ select: () => chain(table) }),
    rpc: async () => ({ data: [], error: null }),
  } as unknown as DbClient;
}

function target() {
  return {
    createFile: (name: string) => {
      const entry = { name, text: '', deleted: false };
      mockCreated.push(entry);
      return {
        write: (text: string) => {
          if (mockCreated.length - 1 === mockFailWriteAt) throw new Error('disk full');
          entry.text = text;
        },
        delete: () => {
          entry.deleted = true;
        },
      };
    },
  };
}

describe('exportCsv on Android (10-review-2 D-4)', () => {
  const original = Platform.OS;
  beforeAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' }));
  afterAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));
  beforeEach(() => {
    reads.length = 0;
    mockCreated.length = 0;
    mockFailWriteAt = -1;
    mockPick.mockReset();
  });

  it('a cancelled folder picker reads nothing', async () => {
    mockPick.mockRejectedValueOnce(new Error('cancelled'));
    const progress = jest.fn();
    await expect(exportCsv(client(), { onProgress: progress })).resolves.toBe('cancelled');
    expect(reads).toEqual([]);
    expect(progress).not.toHaveBeenCalled();
  });

  it('picks the folder first, gathers with progress, then writes', async () => {
    mockPick.mockResolvedValueOnce(target());
    const seen: ExportProgress[] = [];
    await expect(exportCsv(client(), { onProgress: (p) => seen.push(p) })).resolves.toBe('saved');
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(seen[0]).toMatchObject({ phase: 'gathering', done: 0 });
    expect(seen[seen.length - 1]).toEqual({ phase: 'writing' });
    const last = seen[seen.length - 2] as { done: number; total: number };
    expect(last.done).toBe(last.total);
    expect(mockCreated.length).toBeGreaterThan(10);
    expect(mockCreated.every((c) => !c.deleted && c.text !== '')).toBe(true);
  });

  it('a read failure after the folder was chosen writes nothing', async () => {
    mockPick.mockResolvedValueOnce(target());
    await expect(exportCsv(client('categories'))).rejects.toThrow('Export failed reading categories');
    expect(mockCreated).toEqual([]);
  });

  it('a write failure removes the files already written', async () => {
    mockPick.mockResolvedValueOnce(target());
    mockFailWriteAt = 2;
    await expect(exportCsv(client())).rejects.toThrow('disk full');
    expect(mockCreated).toHaveLength(3);
    expect(mockCreated.every((c) => c.deleted)).toBe(true);
  });
});

describe('exportCsv on iOS', () => {
  it('gathers first, then shares; never opens a folder picker', async () => {
    mockPick.mockReset();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const seen: ExportProgress[] = [];
    await expect(exportCsv(client(), { months: ['2026-08'], onProgress: (p) => seen.push(p) })).resolves.toBe('shared');
    expect(mockPick).not.toHaveBeenCalled();
    expect(seen[seen.length - 1]).toEqual({ phase: 'writing' });
    expect(share).toHaveBeenCalledTimes(6);
    share.mockResolvedValueOnce({ action: Share.dismissedAction });
    await expect(exportCsv(client())).resolves.toBe('cancelled');
    share.mockRestore();
  });
});
