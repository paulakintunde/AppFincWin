import { EXPORT_MANIFEST } from '@/data/exportManifest';
import { buildCsvFiles, ExportError, KEPT_FILE, PAGE_SIZE } from '../csvExport';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Directory: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('@/data/sync/lockedWrites', () => ({ getLockedWrites: () => [] }));

const tables = Object.keys(EXPORT_MANIFEST);

describe('buildCsvFiles', () => {
  it('returns one file per manifest table with exactly that table columns', async () => {
    const files = await buildCsvFiles({ fetchPage: async () => [], lockedWrites: [] });
    expect(files.map((f) => f.name)).toEqual(tables.map((t) => `${t}.csv`));
    for (const t of tables) {
      const f = files.find((x) => x.name === `${t}.csv`)!;
      expect(f.text).toBe(`${EXPORT_MANIFEST[t]!.join(',')}\r\n`);
    }
  });

  it('pages by 1000 until a short page', async () => {
    const calls: [string, number, number][] = [];
    const files = await buildCsvFiles({
      lockedWrites: [],
      fetchPage: async (table, _c, from, to) => {
        calls.push([table, from, to]);
        if (table !== 'accounts') return [];
        return from === 0 ? Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `a${i}` })) : [{ id: 'last' }];
      },
    });
    expect(calls.filter(([t]) => t === 'accounts')).toEqual([
      ['accounts', 0, 999],
      ['accounts', 1000, 1999],
    ]);
    const accounts = files.find((f) => f.name === 'accounts.csv')!;
    // header + 1001 rows + trailing empty segment after the last CRLF
    expect(accounts.text.split('\r\n').length).toBe(1 + PAGE_SIZE + 1 + 1);
  });

  it('adds saved-on-this-phone.csv only when writes are kept', async () => {
    const none = await buildCsvFiles({ fetchPage: async () => [], lockedWrites: [] });
    expect(none.some((f) => f.name === KEPT_FILE)).toBe(false);
    const files = await buildCsvFiles({
      fetchPage: async () => [],
      lockedWrites: [
        { id: '1', mutationKey: ['transactions', 'create'], variables: { amount: 500 }, replayable: true, at: '2026-11-19T10:00:00.000Z' },
      ],
    });
    const kept = files.find((f) => f.name === KEPT_FILE)!;
    expect(kept.text).toBe('kept_at,kind,details\r\n2026-11-19T10:00:00.000Z,transactions.create,"{""amount"":500}"\r\n');
  });

  it('a table read error fails the whole export with a typed error', async () => {
    await expect(
      buildCsvFiles({
        lockedWrites: [],
        fetchPage: async (t) => {
          if (t === 'categories') throw new Error('boom');
          return [];
        },
      }),
    ).rejects.toBeInstanceOf(ExportError);
  });
});
