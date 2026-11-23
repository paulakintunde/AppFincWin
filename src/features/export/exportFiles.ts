/**
 * 10-17 (DAT-02): which files an export writes. Kept apart from csvExport so the screen can list them without pulling in
 * the file system.
 */
import { EXPORT_MANIFEST } from '@/data/exportManifest';

/** An archive export carries these in full so the entries can be read. */
export const ARCHIVE_EXPORT_REFERENCE_TABLES = ['accounts', 'categories'] as const;
/** Written for an archive export, filtered to the exported transactions by transaction_id. */
export const ARCHIVE_EXPORT_CHILD_TABLES = ['transaction_splits', 'transaction_member_categories', 'settlement_lines'] as const;
export const SERVER_RECORDS_FILE = 'server-records.csv';

/** The file names an export will write (the kept-on-phone file depends on the lock and is not listed here). */
export function exportFileNames(months?: readonly string[]): string[] {
  if (months && months.length > 0) {
    return ['transactions', ...ARCHIVE_EXPORT_CHILD_TABLES, ...ARCHIVE_EXPORT_REFERENCE_TABLES].map((t) => `${t}.csv`);
  }
  return [...Object.keys(EXPORT_MANIFEST).map((t) => `${t}.csv`), SERVER_RECORDS_FILE];
}
