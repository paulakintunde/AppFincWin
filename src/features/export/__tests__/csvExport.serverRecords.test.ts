import { buildCsvFiles, ExportError, SERVER_RECORDS_FILE } from '../csvExport';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Directory: jest.fn(), Paths: { cache: 'cache' } }));
jest.mock('@/data/sync/lockedWrites', () => ({ getLockedWrites: () => [] }));

describe('server-records.csv (10-17, DAT-02)', () => {
  it('adds table_name,row with the row as JSON text', async () => {
    const files = await buildCsvFiles({
      lockedWrites: [],
      fetchPage: async () => [],
      fetchServerRecords: async () => [{ table_name: 'household_plans', row: { plan_key: 'duo', plan_size: 2 } }],
    });
    const f = files.find((x) => x.name === SERVER_RECORDS_FILE)!;
    expect(f.text).toBe('table_name,row\r\nhousehold_plans,"{""plan_key"":""duo"",""plan_size"":2}"\r\n');
  });

  it('writes only the header when the server holds nothing', async () => {
    const files = await buildCsvFiles({ lockedWrites: [], fetchPage: async () => [], fetchServerRecords: async () => [] });
    expect(files.find((x) => x.name === SERVER_RECORDS_FILE)!.text).toBe('table_name,row\r\n');
  });

  it('guards a formula-looking value inside the row text', async () => {
    const files = await buildCsvFiles({
      lockedWrites: [],
      fetchPage: async () => [],
      fetchServerRecords: async () => [{ table_name: '=cmd', row: null }],
    });
    expect(files.find((x) => x.name === SERVER_RECORDS_FILE)!.text).toContain("'=cmd");
  });

  it('an error reading server records throws ExportError and no partial set', async () => {
    await expect(
      buildCsvFiles({
        lockedWrites: [],
        fetchPage: async () => [],
        fetchServerRecords: async () => {
          throw new Error('rpc down');
        },
      }),
    ).rejects.toBeInstanceOf(ExportError);
  });
});
