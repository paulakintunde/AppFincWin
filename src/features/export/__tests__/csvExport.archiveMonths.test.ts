import { ARCHIVE_EXPORT_REFERENCE_TABLES, buildCsvFiles, ExportError, monthRange, type DateRange } from '../csvExport';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Directory: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('@/data/sync/lockedWrites', () => ({ getLockedWrites: () => [] }));

describe('archived-months export (10-17, DAT-01)', () => {
  it('builds half-open month ranges and rolls December to January', () => {
    expect(monthRange('2026-08')).toEqual({ column: 'local_date', gte: '2026-08-01', lt: '2026-09-01' });
    expect(monthRange('2026-12')).toEqual({ column: 'local_date', gte: '2026-12-01', lt: '2027-01-01' });
  });

  it('fetches transactions once per month and writes only the filtered set', async () => {
    const ranges: DateRange[] = [];
    const tables: string[] = [];
    const files = await buildCsvFiles({
      months: ['2026-08', '2026-09'],
      lockedWrites: [{ id: '1', mutationKey: ['x'], variables: {}, replayable: true, at: 'a' }],
      fetchServerRecords: async () => [{ table_name: 'household_plans', row: {} }],
      fetchPage: async (table, _c, _f, _t, range) => {
        tables.push(table);
        if (table === 'transactions') {
          ranges.push(range!);
          return range!.gte === '2026-08-01' ? [{ id: 't1' }] : [{ id: 't2' }];
        }
        if (table === 'transaction_splits') return [{ transaction_id: 't1', id: 's1' }, { transaction_id: 'other', id: 's2' }];
        if (table === 'transaction_member_categories') return [{ transaction_id: 't2' }];
        if (table === 'settlement_lines') return [{ transaction_id: 'zzz' }];
        return [{ id: `${table}-row` }];
      },
    });
    expect(ranges).toEqual([
      { column: 'local_date', gte: '2026-08-01', lt: '2026-09-01' },
      { column: 'local_date', gte: '2026-09-01', lt: '2026-10-01' },
    ]);
    expect(files.map((f) => f.name)).toEqual([
      'transactions.csv',
      'transaction_splits.csv',
      'transaction_member_categories.csv',
      'settlement_lines.csv',
      'accounts.csv',
      'categories.csv',
    ]);
    expect(ARCHIVE_EXPORT_REFERENCE_TABLES).toEqual(['accounts', 'categories']);
    const text = (n: string) => files.find((f) => f.name === n)!.text;
    expect(text('transactions.csv')).toContain('t1');
    expect(text('transactions.csv')).toContain('t2');
    expect(text('transaction_splits.csv')).toContain('s1');
    expect(text('transaction_splits.csv')).not.toContain('s2');
    expect(text('settlement_lines.csv').split('\r\n').filter(Boolean)).toHaveLength(1);
    expect(text('accounts.csv')).toContain('accounts-row');
    expect(tables.filter((t) => t === 'transactions')).toHaveLength(2);
  });

  it('months undefined or empty is the full export', async () => {
    const a = await buildCsvFiles({ lockedWrites: [], fetchPage: async () => [] });
    const b = await buildCsvFiles({ months: [], lockedWrites: [], fetchPage: async () => [] });
    expect(b.map((f) => f.name)).toEqual(a.map((f) => f.name));
    expect(a.length).toBeGreaterThan(10);
  });

  it('an error on a filtered fetch throws ExportError', async () => {
    await expect(
      buildCsvFiles({
        months: ['2026-08'],
        lockedWrites: [],
        fetchPage: async (t) => {
          if (t === 'transactions') throw new Error('boom');
          return [];
        },
      }),
    ).rejects.toBeInstanceOf(ExportError);
  });
});
