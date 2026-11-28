/**
 * 09 D-03 / Owner Answer 2: a simple CSV export that works in every plan state (reads stay open when locked).
 * Phase 10 DAT-02 builds the full export screen on this.
 *
 * One file per EXPORT_MANIFEST table, plus saved-on-this-phone.csv for writes kept on the phone by a lock (D-40).
 * Reads run as the signed-in user, so RLS limits rows to the person's own and shared ones (CMP-F18, T-09-62).
 *
 * 10-review-2 (D-1, owner 2026-11-28; supersedes 10-review D-1): accounts, savings_goals, debts and holdings are written
 * with normal amounts in each row's currency plus a trailing amount_format = 'decimal' column (engine/dataCsv
 * toExportRow), so Import reads them back exactly. Other tables keep integer minor units as stored.
 * 10-review-2 (D-4): on Android the folder picker opens first, before anything is read; a cancel reads nothing. Progress
 * is reported per table (onProgress), then 'writing'. Nothing is written until every table has been read, and a failed
 * write removes what it had written, so no partial set is left behind. On iOS the share sheet comes last.
 */
import { Platform, Share } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { DbClient } from '@/db/rows';
import { EXPORT_MANIFEST } from '@/data/exportManifest';
import { getLockedWrites, type LockedWrite } from '@/data/sync/lockedWrites';
import { exponentWith, exportColumns, isDataTable, toExportRow } from '@/engine/dataCsv';
import type { KnownCustomCurrency } from '@/engine/money';
import { toCsv } from './csvSerialize';
import { ARCHIVE_EXPORT_CHILD_TABLES, ARCHIVE_EXPORT_REFERENCE_TABLES, SERVER_RECORDS_FILE } from './exportFiles';
import { withExternalActivity } from '@/services/lock/externalActivity';

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

/** 10-review-2 (D-4): where an export is. 'gathering' counts tables read; 'writing' is the file step. */
export type ExportProgress = { phase: 'gathering'; done: number; total: number } | { phase: 'writing' };

/** 10-17: months are 'YYYY-MM'; absent or empty means the full export. */
export interface ExportOptions {
  months?: readonly string[];
  onProgress?: (progress: ExportProgress) => void;
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
  /** 10-review-2 (D-4): called with (0, total) first, then after each table is read. */
  onProgress?: (done: number, total: number) => void;
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

/** 10-review-2 (D-1): the person's custom currencies, so a custom amount is written with its own decimals. */
async function readExponents(deps: BuildDeps): Promise<(code: string) => number> {
  const rows = await fetchAll(deps, 'custom_currencies', ['code', 'decimals']);
  const customs: KnownCustomCurrency[] = rows
    .filter((r) => typeof r.code === 'string' && typeof r.decimals === 'number')
    .map((r) => ({ code: r.code as string, decimals: r.decimals as number }));
  return exponentWith(customs);
}

/** One table's file; the four importable tables get normal amounts and the format marker. */
function tableFile(table: string, columns: readonly string[], rows: readonly Record<string, unknown>[], exponentOf: (code: string) => number): CsvFile {
  if (!isDataTable(table)) return { name: `${table}.csv`, text: toCsv(columns, rows) };
  return { name: `${table}.csv`, text: toCsv(exportColumns(columns), rows.map((r) => toExportRow(table, r, exponentOf))) };
}

async function buildArchiveFiles(deps: BuildDeps, months: readonly string[]): Promise<CsvFile[]> {
  const total = 1 + ARCHIVE_EXPORT_CHILD_TABLES.length + ARCHIVE_EXPORT_REFERENCE_TABLES.length;
  let done = 0;
  const step = () => deps.onProgress?.((done += 1), total);
  deps.onProgress?.(0, total);
  const exponentOf = await readExponents(deps);
  const files: CsvFile[] = [];
  const txColumns = EXPORT_MANIFEST.transactions ?? [];
  const txRows: Record<string, unknown>[] = [];
  for (const month of months) txRows.push(...(await fetchAll(deps, 'transactions', txColumns, monthRange(month))));
  files.push({ name: 'transactions.csv', text: toCsv(txColumns, txRows) });
  step();
  const ids = new Set(txRows.map((r) => String(r.id)));
  for (const table of ARCHIVE_EXPORT_CHILD_TABLES) {
    const columns = EXPORT_MANIFEST[table] ?? [];
    const rows = (await fetchAll(deps, table, columns)).filter((r) => ids.has(String(r.transaction_id)));
    files.push({ name: `${table}.csv`, text: toCsv(columns, rows) });
    step();
  }
  for (const table of ARCHIVE_EXPORT_REFERENCE_TABLES) {
    const columns = EXPORT_MANIFEST[table] ?? [];
    files.push(tableFile(table, columns, await fetchAll(deps, table, columns), exponentOf));
    step();
  }
  return files;
}

export async function buildCsvFiles(deps: BuildDeps): Promise<CsvFile[]> {
  if (deps.months && deps.months.length > 0) return buildArchiveFiles(deps, deps.months);
  const tables = Object.entries(EXPORT_MANIFEST);
  const total = tables.length + (deps.fetchServerRecords ? 1 : 0);
  let done = 0;
  const step = () => deps.onProgress?.((done += 1), total);
  deps.onProgress?.(0, total);
  const exponentOf = await readExponents(deps);
  const files: CsvFile[] = [];
  for (const [table, columns] of tables) {
    files.push(tableFile(table, columns, await fetchAll(deps, table, columns), exponentOf));
    step();
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
    step();
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

/** Writes every file into the chosen folder; on a failure removes what it wrote, then rethrows. */
function writeAll(target: Directory, files: readonly CsvFile[]): void {
  const written: File[] = [];
  try {
    for (const f of files) {
      const file = target.createFile(f.name.replace(/\.csv$/, ''), 'text/csv');
      written.push(file);
      file.write(f.text);
    }
  } catch (err) {
    for (const file of written) {
      try {
        file.delete();
      } catch {
        // Best effort: the folder is the person's own; a file that will not go is left for them.
      }
    }
    throw err;
  }
}

export async function exportCsv(client: DbClient, opts?: ExportOptions): Promise<'saved' | 'shared' | 'cancelled'> {
  const months = opts?.months && opts.months.length > 0 ? opts.months : undefined;
  const report = opts?.onProgress;

  // 10-review-2 (D-4): the folder first, so the person is not kept waiting before choosing; a cancel reads nothing.
  let target: Directory | null = null;
  if (Platform.OS === 'android') {
    try {
      target = await withExternalActivity(() => Directory.pickDirectoryAsync()); // 10-review (L-6)
    } catch {
      return 'cancelled';
    }
  }

  const files = await buildCsvFiles({
    lockedWrites: getLockedWrites(),
    ...(months ? { months } : {}),
    ...(report ? { onProgress: (done: number, total: number) => report({ phase: 'gathering', done, total }) } : {}),
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
      // The RPC column is record_json (`row` is a reserved word in Postgres)
      const out = (data ?? []) as unknown as { table_name: string; record_json: unknown }[];
      return out.map((r) => ({ table_name: r.table_name, row: r.record_json }));
    },
  });
  report?.({ phase: 'writing' });

  if (target !== null) {
    writeAll(target, files);
    return 'saved';
  }

  const dir = new Directory(Paths.cache, folderName(new Date(), months !== undefined));
  // T-09-64: the files exist in the cache only while they are being shared, then the folder goes.
  try {
    if (!dir.exists) dir.create();
    const written = files.map((f) => {
      const file = new File(dir, f.name);
      if (!file.exists) file.create();
      file.write(f.text);
      return file;
    });
    for (const file of written) {
      const result = await withExternalActivity(() => Share.share({ url: file.uri })); // 10-review (L-6)
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
