/**
 * 10-review-2 (D-1, owner 2026-11-28; supersedes 10-review D-1): how Export writes the amounts of the four importable
 * tables. Each money column becomes a normal amount in the row's own currency, written the canonical way (dot decimal,
 * the currency's own decimals, no grouping, a hyphen minus: USD 25.00, JPY 2500, KWD 1.250), and the row carries
 * amount_format = 'decimal'. Exact: integer-string work only (money toDecimalString), never a float.
 * Pure: no imports from db/, state/, services/, ui/ or react.
 */
import { formatExportAmount } from './amount';
import { AMOUNT_FORMAT_COLUMN, AMOUNT_FORMAT_DECIMAL, DATA_CSV_SCHEMAS, type DataTable } from './schemas';

const INTEGER = /^-?\d+$/;

export function isDataTable(table: string): table is DataTable {
  return Object.prototype.hasOwnProperty.call(DATA_CSV_SCHEMAS, table);
}

/** The export's columns for a data table: the table's own, then the marker last. */
export function exportColumns(columns: readonly string[]): string[] {
  return [...columns, AMOUNT_FORMAT_COLUMN];
}

/** One stored row as Export writes it. A value that is not a whole minor-unit number is left as it is. */
export function toExportRow(
  table: DataTable,
  row: Readonly<Record<string, unknown>>,
  exponentOf: (currency: string) => number,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, [AMOUNT_FORMAT_COLUMN]: AMOUNT_FORMAT_DECIMAL };
  const currency = typeof row.currency === 'string' ? row.currency : '';
  const exponent = exponentOf(currency);
  for (const col of DATA_CSV_SCHEMAS[table].money) {
    const value = row[col];
    const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    if (!INTEGER.test(text) || !Number.isSafeInteger(Number(text))) continue;
    out[col] = formatExportAmount(Number(text), exponent);
  }
  return out;
}
