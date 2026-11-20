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

export interface BuildDeps {
  fetchPage(table: string, columns: readonly string[], from: number, to: number): Promise<Record<string, unknown>[]>;
  lockedWrites: readonly LockedWrite[];
}

async function fetchAll(deps: BuildDeps, table: string, columns: readonly string[]): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let page: Record<string, unknown>[];
    try {
      page = await deps.fetchPage(table, columns, from, from + PAGE_SIZE - 1);
    } catch (err) {
      throw new ExportError(table, err);
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function buildCsvFiles(deps: BuildDeps): Promise<CsvFile[]> {
  const files: CsvFile[] = [];
  for (const [table, columns] of Object.entries(EXPORT_MANIFEST)) {
    const rows = await fetchAll(deps, table, columns);
    files.push({ name: `${table}.csv`, text: toCsv(columns, rows) });
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

function folderName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `fincwin-export-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export async function exportCsv(client: DbClient): Promise<'saved' | 'shared' | 'cancelled'> {
  const files = await buildCsvFiles({
    lockedWrites: getLockedWrites(),
    fetchPage: async (table, columns, from, to) => {
      const { data, error } = await client.from(table).select(columns.join(',')).range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
  });

  const dir = new Directory(Paths.cache, folderName(new Date()));
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
