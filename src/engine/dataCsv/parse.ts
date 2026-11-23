/**
 * 10-07 (DAT-03): pure import parsing for accounts, goals, debts and investments. Built on the statement tokenizer;
 * money is read as integer minor units and never rounded; the export's formula-injection apostrophe is reversed.
 * No imports from db/, state/, services/, ui/ or react.
 */
import { tokenize } from '../csv/tokenize';
import { MAX_ABS_AMOUNT_MINOR } from '../money/types';
import { DATA_CSV_SCHEMAS, type DataTable } from './schemas';

export type DataRowIssue =
  | 'name-missing'
  | 'currency-missing'
  | 'bad-amount'
  | 'too-many-decimals'
  | 'bad-date'
  | 'bad-choice'
  | 'bad-id';

export interface DataCsvRow {
  index: number;
  values: Record<string, string | null>;
  money: Record<string, number | null>;
  issues: DataRowIssue[];
}

export type DataCsvResult =
  | { ok: true; table: DataTable; columns: string[]; rows: DataCsvRow[] }
  | {
      ok: false;
      error: 'empty' | 'unreadable' | 'too-many-rows' | 'header-mismatch';
      missing?: string[];
      unknown?: string[];
    };

export type RowMatch = 'new' | 'same-id' | 'same-name';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE = /^-?\d+$/;
const DECIMAL = /^(-?)(\d*)\.(\d+)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/** Reverses the export's guard: one leading apostrophe is removed only before = + - @. */
export function unescapeCell(cell: string): string {
  if (cell.length > 1 && cell[0] === "'" && '=+-@'.includes(cell[1] as string)) return cell.slice(1);
  return cell;
}

function validDate(text: string): boolean {
  const m = DATE.exec(text);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= days;
}

type MoneyOutcome = { minor: number } | { issue: 'bad-amount' | 'too-many-decimals' };

function readMoney(cell: string, exponent: number): MoneyOutcome {
  let minor: number;
  if (WHOLE.test(cell)) {
    minor = Number.parseInt(cell, 10);
  } else {
    const m = DECIMAL.exec(cell);
    if (!m) return { issue: 'bad-amount' };
    const frac = m[3] as string;
    if (frac.length > exponent) {
      // A trailing run of zeros beyond the exponent is still more precision than the currency has.
      return { issue: 'too-many-decimals' };
    }
    const digits = `${m[2] || '0'}${frac.padEnd(exponent, '0')}`;
    minor = Number.parseInt(digits, 10) * (m[1] === '-' ? -1 : 1);
  }
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_ABS_AMOUNT_MINOR) return { issue: 'bad-amount' };
  return { minor };
}

export function parseDataCsv(
  table: DataTable,
  text: string,
  exponentOf: (currency: string) => number
): DataCsvResult {
  const schema = DATA_CSV_SCHEMAS[table];
  const tok = tokenize(text);
  if (!tok.ok) {
    if (tok.error === 'empty') return { ok: false, error: 'empty' };
    if (tok.error === 'too-many-rows') return { ok: false, error: 'too-many-rows' };
    return { ok: false, error: 'unreadable' };
  }

  const header = (tok.rows[0] as string[]).map((h) => h.trim().toLowerCase());
  const allowed = new Set(schema.allowed);
  const missing = schema.required.filter((c) => !header.includes(c));
  const unknown = header.filter((c) => !allowed.has(c));
  if (missing.length > 0 || unknown.length > 0) {
    const out: DataCsvResult = { ok: false, error: 'header-mismatch' };
    if (missing.length > 0) out.missing = [...missing];
    if (unknown.length > 0) out.unknown = unknown;
    return out;
  }

  const ignored = new Set(['household_id', 'created_by', 'deleted_at', 'created_at', 'updated_at', 'check_id', 'series_id', 'extra_series_id', 'tombstone_of']);
  const moneyCols = new Set(schema.money);
  const dateCols = new Set(schema.dates);

  const rows: DataCsvRow[] = [];
  for (let r = 1; r < tok.rows.length; r += 1) {
    const cells = tok.rows[r] as string[];
    const values: Record<string, string | null> = {};
    header.forEach((col, i) => {
      if (ignored.has(col)) return;
      const raw = unescapeCell(cells[i] ?? '');
      values[col] = raw.trim() === '' ? null : raw;
    });

    const issues: DataRowIssue[] = [];
    const add = (i: DataRowIssue) => {
      if (!issues.includes(i)) issues.push(i);
    };

    if (values.name === null || values.name === undefined) add('name-missing');
    const currency = values[schema.currencyColumn];
    if (currency === null || currency === undefined) add('currency-missing');
    if (values.id !== null && values.id !== undefined && !UUID.test(values.id)) add('bad-id');

    const exponent = exponentOf(currency ?? '');
    const money: Record<string, number | null> = {};
    for (const col of header) {
      if (!moneyCols.has(col)) continue;
      const cell = values[col];
      if (cell === null || cell === undefined) {
        money[col] = null;
        if (schema.required.includes(col)) add('bad-amount');
        continue;
      }
      const out = readMoney(cell.trim(), exponent);
      if ('issue' in out) {
        money[col] = null;
        add(out.issue);
      } else {
        money[col] = out.minor;
      }
    }

    for (const col of header) {
      const cell = values[col];
      if (cell === null || cell === undefined) continue;
      if (dateCols.has(col) && !validDate(cell.trim())) add('bad-date');
      const choices = schema.enums[col];
      if (choices && !choices.includes(cell.trim())) add('bad-choice');
    }

    rows.push({ index: r - 1, values, money, issues });
  }

  return { ok: true, table, columns: header, rows };
}

export function classifyRows(
  rows: readonly DataCsvRow[],
  existing: readonly { id: string; name: string }[]
): RowMatch[] {
  const ids = new Set(existing.map((e) => e.id));
  const names = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  return rows.map((row) => {
    const id = row.values.id;
    if (id !== null && id !== undefined && ids.has(id)) return 'same-id';
    const name = row.values.name;
    if (name !== null && name !== undefined && names.has(name.trim().toLowerCase())) return 'same-name';
    return 'new';
  });
}
