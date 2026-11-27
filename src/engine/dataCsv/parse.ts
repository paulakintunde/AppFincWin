/**
 * 10-07 (DAT-03): pure import parsing for accounts, goals, debts and investments. Built on the statement tokenizer;
 * money is read as integer minor units and never rounded; the export's formula-injection apostrophe is reversed.
 * 10-review (D-1): money cells have ONE unit, integer minor units as Export writes them. A cell with a decimal point is
 * flagged 'decimal-amount' and never re-scaled, so a spreadsheet that re-saves 150000 as 150000.00 cannot import 100x.
 * No imports from db/, state/, services/, ui/ or react.
 */
import { tokenize } from '../csv/tokenize';
import { MAX_ABS_AMOUNT_MINOR } from '../money/types';
import { DATA_CSV_SCHEMAS, type DataTable } from './schemas';

export type DataRowIssue =
  | 'name-missing'
  | 'currency-missing'
  | 'bad-amount'
  | 'decimal-amount'
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
      /** 10-review (D-6): a column named more than once; which value wins would be a guess. */
      duplicate?: string[];
    };

export type RowMatch = 'new' | 'same-id' | 'same-name';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE = /^-?\d+$/;
const DECIMAL = /^-?(\d+\.\d*|\.\d+)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/**
 * Reverses the export's guard: one leading apostrophe is removed when apostrophes run up to = + - @.
 * 10-30: export adds one ' to any text matching ^'*[=+-@], so "'=!" round-trips as "''=!" and comes back intact.
 * 10-review (D-8): a leading tab or carriage return is guarded too (OWASP CSV injection list), mirrored here.
 */
const GUARDED = /^'+[=+\-@\t\r]/;
export function unescapeCell(cell: string): string {
  return GUARDED.test(cell) ? cell.slice(1) : cell;
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

type MoneyOutcome = { minor: number } | { issue: 'bad-amount' | 'decimal-amount' };

function readMoney(cell: string): MoneyOutcome {
  if (!WHOLE.test(cell)) {
    // 10-review (D-1): "2500.00" is not read as major units; the person is asked to write it as minor units.
    return { issue: DECIMAL.test(cell) ? 'decimal-amount' : 'bad-amount' };
  }
  const minor = Number.parseInt(cell, 10);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_ABS_AMOUNT_MINOR) return { issue: 'bad-amount' };
  return { minor };
}

export function parseDataCsv(table: DataTable, text: string): DataCsvResult {
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
  const duplicate = [...new Set(header.filter((c, i) => c !== '' && header.indexOf(c) !== i))];
  if (missing.length > 0 || unknown.length > 0 || duplicate.length > 0) {
    const out: DataCsvResult = { ok: false, error: 'header-mismatch' };
    if (missing.length > 0) out.missing = [...missing];
    if (unknown.length > 0) out.unknown = unknown;
    if (duplicate.length > 0) out.duplicate = duplicate;
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

    const money: Record<string, number | null> = {};
    for (const col of header) {
      if (!moneyCols.has(col)) continue;
      const cell = values[col];
      if (cell === null || cell === undefined) {
        money[col] = null;
        if (schema.required.includes(col)) add('bad-amount');
        continue;
      }
      const out = readMoney(cell.trim());
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

/**
 * 10-review (D-5): a name repeated inside the same file is 'same-name' to its earlier row, so two "Savings" rows are
 * not both added silently; the person can still switch the later one on.
 */
export function classifyRows(
  rows: readonly DataCsvRow[],
  existing: readonly { id: string; name: string }[]
): RowMatch[] {
  const ids = new Set(existing.map((e) => e.id));
  const names = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const seen = new Set<string>();
  return rows.map((row) => {
    const id = row.values.id;
    const name = row.values.name;
    const key = name !== null && name !== undefined ? name.trim().toLowerCase() : null;
    const earlier = key !== null && seen.has(key);
    if (key !== null) seen.add(key);
    if (id !== null && id !== undefined && ids.has(id)) return 'same-id';
    if (key !== null && (names.has(key) || earlier)) return 'same-name';
    return 'new';
  });
}
