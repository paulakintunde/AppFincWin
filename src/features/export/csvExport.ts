/**
 * 09 D-03 / Owner Answer 2: a simple CSV export that works in every plan state (reads stay open when locked).
 * Phase 10 DAT-02 builds the full export screen on this.
 *
 * One file per EXPORT_MANIFEST table, plus saved-on-this-phone.csv for writes kept on the phone by a lock (D-40).
 * Reads run as the signed-in user, so RLS limits rows to the person's own and shared ones (CMP-F18, T-09-62).
 */
import { Platform, Share } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { DbClient } from '@/db/rows';
import { EXPORT_MANIFEST } from '@/data/exportManifest';
import { getLockedWrites, type LockedWrite } from '@/data/sync/lockedWrites';
import { toCsv } from './csvSerialize';
import { ARCHIVE_EXPORT_CHILD_TABLES, ARCHIVE_EXPORT_REFERENCE_TABLES, SERVER_RECORDS_FILE } from './exportFiles';

export { ARCHIVE_EXPORT_REFERENCE_TABLES, SERVER_RECORDS_FILE };

export const PAGE_SIZE = 1000;
export const KEPT_FILE = 'saved-on-this-phone.csv';
const KEPT_COLUMNS = ['kept_at', 'kind', 'details'] as const;

/** The export failed as a whole: no partial file set is ever offered. */
export class ExportError extends Error {
  readonly table: string;
  constructor(table: string, cause: unknown) {
    super(`Export failed reading ${table}`);
    this.name = 'ExportError';
    this.table = table;
    this.cause = cause;
  }
}

export interface CsvFile {
  name: string;
  text: string;
}

/** 10-17 (DAT-01, DAT-02): a half-open local_date window, 'YYYY-MM-DD', lt exclusive. */
export interface DateRange {
  column: 'local_date';
  gte: string;
  lt: string;
}

/** 10-17: months are 'YYYY-MM'; absent or empty means the full export. */
export interface ExportOptions {
  months?: readonly string[];
}

const SERVER_COLUMNS = ['table_name', 'row'] as const;

export interface ServerRecord {
  table_name: string;
  row: unknown;
}

export interface BuildDeps {
  fetchPage(
    table: string,
    columns: readonly string[],
    from: number,
    to: number,
    dateRange?: DateRange,
  ): Promise<Record<string, unknown>[]>;
  lockedWrites: readonly LockedWrite[];
  /** 10-17: the server-held records the client cannot read (my_server_export). Omitted: no server-records.csv. */
  fetchServerRecords?(): Promise<ServerRecord[]>;
  months?: readonly string[];
}

/** First day of a 'YYYY-MM' month and of the next one, with plain string arithmetic (December rolls to January). */
export function monthRange(month: string): DateRange {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const p = (n: number) => String(n).padStart(2, '0');
  const next = m === 12 ? `${y + 1}-01` : `${y}-${p(m + 1)}`;
  return { column: 'local_date', gte: `${month}-01`, lt: `${next}-01` };
}

async function fetchAll(
  deps: BuildDeps,
  table: string,
  columns: readonly string[],
  dateRange?: DateRange,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let page: Record<string, unknown>[];
    try {
      page = await (dateRange
        ? deps.fetchPage(table, columns, from, from + PAGE_SIZE - 1, dateRange)
        : deps.fetchPage(table, columns, from, from + PAGE_SIZE - 1));
    } catch (err) {
      throw new ExportError(table, err);
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function buildArchiveFiles(deps: BuildDeps, months: readonly string[]): Promise<CsvFile[]> {
  const files: CsvFile[] = [];
  const txColumns = EXPORT_MANIFEST.transactions ?? [];
  const txRows: Record<string, unknown>[] = [];
  for (const month of months) txRows.push(...(await fetchAll(deps, 'transactions', txColumns, monthRange(month))));
  files.push({ name: 'transactions.csv', text: toCsv(txColumns, txRows) });
  const ids = new Set(txRows.map((r) => String(r.id)));
  for (const table of ARCHIVE_EXPORT_CHILD_TABLES) {
    const columns = EXPORT_MANIFEST[table] ?? [];
    const rows = (await fetchAll(deps, table, columns)).filter((r) => ids.has(String(r.transaction_id)));
    files.push({ name: `${table}.csv`, text: toCsv(columns, rows) });
  }
  for (const table of ARCHIVE_EXPORT_REFERENCE_TABLES) {
    const columns = EXPORT_MANIFEST[table] ?? [];
    files.push({ name: `${table}.csv`, text: toCsv(columns, await fetchAll(deps, table, columns)) });
  }
  return files;
}

export async function buildCsvFiles(deps: BuildDeps): Promise<CsvFile[]> {
  if (deps.months && deps.months.length > 0) return buildArchiveFiles(deps, deps.months);
  const files: CsvFile[] = [];
  for (const [table, columns] of Object.entries(EXPORT_MANIFEST)) {
    const rows = await fetchAll(deps, table, columns);
    files.push({ name: `${table}.csv`, text: toCsv(columns, rows) });
  }
  if (deps.fetchServerRecords) {
    let records: ServerRecord[];
    try {
      records = await deps.fetchServerRecords();
    } catch (err) {
      throw new ExportError('server records', err);
    }
    const rows = records.map((r) => ({ table_name: r.table_name, row: JSON.stringify(r.row ?? null) }));
    files.push({ name: SERVER_RECORDS_FILE, text: toCsv(SERVER_COLUMNS, rows) });
  }
  if (deps.lockedWrites.length > 0) {
    const kept = deps.lockedWrites.map((w) => ({
      kept_at: w.at,
      kind: w.mutationKey.map(String).join('.'),
      details: JSON.stringify(w.variables ?? null),
    }));
    files.push({ name: KEPT_FILE, text: toCsv(KEPT_COLUMNS, kept) });
  }
  return files;
}

function folderName(now: Date, archive = false): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${archive ? 'fincwin-archive-export-' : 'fincwin-export-'}${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export async function exportCsv(client: DbClient, opts?: ExportOptions): Promise<'saved' | 'shared' | 'cancelled'> {
  const months = opts?.months && opts.months.length > 0 ? opts.months : undefined;
  const files = await buildCsvFiles({
    lockedWrites: getLockedWrites(),
    ...(months ? { months } : {}),
    fetchPage: async (table, columns, from, to, dateRange) => {
      let query = client.from(table).select(columns.join(','));
      if (dateRange) query = query.gte(dateRange.column, dateRange.gte).lt(dateRange.column, dateRange.lt);
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
    fetchServerRecords: async () => {
      const { data, error } = await client.rpc('my_server_export');
      if (error) throw error;
      return (data ?? []) as unknown as ServerRecord[];
    },
  });

  const dir = new Directory(Paths.cache, folderName(new Date(), months !== undefined));
  // T-09-64: the files exist in the cache only while they are being copied or shared, then the folder goes.
  try {
    if (!dir.exists) dir.create();
    const written = files.map((f) => {
      const file = new File(dir, f.name);
      if (!file.exists) file.create();
      file.write(f.text);
      return file;
    });

    if (Platform.OS === 'android') {
      let target: Directory;
      try {
        target = await Directory.pickDirectoryAsync();
      } catch {
        return 'cancelled';
      }
      files.forEach((f) => {
        target.createFile(f.name.replace(/\.csv$/, ''), 'text/csv').write(f.text);
      });
      return 'saved';
    }

    for (const file of written) {
      const result = await Share.share({ url: file.uri });
      if (result.action === Share.dismissedAction) return 'cancelled';
    }
    return 'shared';
  } finally {
    try {
      if (dir.exists) dir.delete();
    } catch {
      // The cache is cleared by the system anyway.
    }
  }
}
