/**
 * 10-18 (DAT-03): the import template for each table is the export's column list with one example row, so a file saved by
 * Export and the template read the same way. Pure.
 * 10-review-2 (D-1, owner 2026-11-28; supersedes 10-review D-1): amounts are normal amounts in the row's currency (25.00),
 * written by the same toExportRow as Export, and the amount_format = 'decimal' marker is the last column.
 */
import { AMOUNT_FORMAT_COLUMN, DATA_CSV_SCHEMAS, exponentWith, toExportRow, type DataTable } from '@/engine/dataCsv';
import { toCsv } from '@/features/export/csvSerialize';

// Server bookkeeping the importer ignores; not part of a template.
const BOOKKEEPING = new Set([
  'household_id', 'created_by', 'deleted_at', 'created_at', 'updated_at', 'check_id', 'series_id', 'extra_series_id', 'tombstone_of',
]);

export const TEMPLATE_FILE: Readonly<Record<DataTable, string>> = {
  accounts: 'fincwin-accounts-template.csv',
  savings_goals: 'fincwin-goals-template.csv',
  debts: 'fincwin-debts-template.csv',
  holdings: 'fincwin-investments-template.csv',
};

/** The columns a template carries: the export order, without server bookkeeping, then the format marker. */
export function templateColumns(table: DataTable): string[] {
  return [...DATA_CSV_SCHEMAS[table].allowed.filter((c) => !BOOKKEEPING.has(c)), AMOUNT_FORMAT_COLUMN];
}

function example(table: DataTable, currency: string): Record<string, string> {
  switch (table) {
    case 'accounts':
      return { name: 'Everyday', kind: 'checking', currency, opening_balance: '150000' };
    case 'savings_goals':
      return { name: 'Holiday', currency, target: '200000', monthly_amount: '20000', ready_by: '2027-06-01', opening_saved: '0', kind: 'wait' };
    case 'debts':
      return { name: 'Car loan', kind: 'loan', currency, balance: '800000', apr: '6.5', minimum_payment: '25000', due_day: '15' };
    case 'holdings':
      return { name: 'Index fund', type: 'brokerage', currency, value: '500000', value_as_of: '2026-01-01', opening_put_in: '450000' };
  }
}

/** CSV text: the header, then one example row (examples are minor units here, written as normal amounts). */
export function buildTemplate(table: DataTable, currency = 'USD', exponentOf: (code: string) => number = exponentWith()): string {
  const cols = templateColumns(table);
  return toCsv(cols, [toExportRow(table, example(table, currency), exponentOf)]);
}
