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
      // 10-review-2 (D-1): the four importable tables carry the amount_format marker last
      const marker = ['accounts', 'savings_goals', 'debts', 'holdings'].includes(t) ? ',amount_format' : '';
      expect(f.text).toBe(`${EXPORT_MANIFEST[t]!.join(',')}${marker}\r\n`);
    }
  });

  it('10-review-2 (D-1): writes data-table amounts in each currency own decimals, custom ones included', async () => {
    const files = await buildCsvFiles({
      lockedWrites: [],
      fetchPage: async (table) => {
        if (table === 'custom_currencies') return [{ code: 'GLD1', decimals: 4 }, { code: 3 }];
        if (table === 'accounts') return [{ name: 'A', currency: 'KWD', opening_balance: 1250 }, { name: 'B', currency: 'GLD1', opening_balance: -5 }];
        if (table === 'transactions') return [{ id: 't', original_amount: 2500, original_currency: 'USD' }];
        return [];
      },
    });
    const lines = files.find((f) => f.name === 'accounts.csv')!.text.split('\r\n');
    expect(lines[1]).toContain(',1.250,');
    expect(lines[1]!.endsWith(',decimal')).toBe(true);
    expect(lines[2]).toContain(',-0.0005,');
    // other tables keep minor units as stored
    expect(files.find((f) => f.name === 'transactions.csv')!.text.split('\r\n')[1]).toContain(',2500,');
  });

  it('10-review-2 (D-4): reports progress from 0 to one step per table, plus server records', async () => {
    const seen: [number, number][] = [];
    await buildCsvFiles({ fetchPage: async () => [], lockedWrites: [], fetchServerRecords: async () => [], onProgress: (d, t) => seen.push([d, t]) });
    const total = tables.length + 1;
    expect(seen[0]).toEqual([0, total]);
    expect(seen[seen.length - 1]).toEqual([total, total]);
    expect(seen).toHaveLength(total + 1);
    const archive: [number, number][] = [];
    await buildCsvFiles({ months: ['2026-08'], fetchPage: async () => [], lockedWrites: [], onProgress: (d, t) => archive.push([d, t]) });
    expect(archive.map(([d]) => d)).toEqual([0, 1, 2, 3, 4, 5, 6]);
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
