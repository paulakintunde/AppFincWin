/**
 * 10-07 (DAT-03): pure import parsing for accounts, goals, debts and investments. Built on the statement tokenizer;
 * money is never rounded; the export's formula-injection apostrophe is reversed.
 * 10-review-2 (D-1, D-2; owner 2026-11-28, supersedes 10-review D-1 "whole minor units only"): amounts are normal money
 * amounts, read flexibly (amount.ts). The unit is decided once per file and the person is never asked:
 *  (a) an amount_format column says 'decimal' or 'minor' (Export and the template write 'decimal' on every row);
 *  (b) the file is an older FincWin export (every row has a UUID id, the header carries the export-only bookkeeping
 *      columns household_id, created_at and updated_at, there is no amount_format column, and every amount is a plain
 *      integer): whole minor units, as those exports were written;
 *  (c) otherwise normal amounts: "2500" is 2,500.00.
 * The decimal mark is decided per money column where the column proves one, else per file; a cell that contradicts it
 * is flagged on its row only. No imports from db/, state/, services/, ui/ or react.
 */
import { tokenize } from '../csv/tokenize';
import { MAX_ABS_AMOUNT_MINOR, currencyExponent } from '../money';
import { resolveCell, shapeCell, toMinor, type CellShape, type Mark } from './amount';
import { AMOUNT_FORMAT_COLUMN, DATA_CSV_SCHEMAS, type DataTable } from './schemas';

export type DataRowIssue =
  | 'name-missing'
  | 'currency-missing'
  | 'bad-amount'
  | 'extra-decimals'
  | 'mixed-format'
  | 'bad-date'
  | 'bad-choice'
  | 'bad-id';

/** 10-review-2 (D-2): a note that does not block the row: an amount nothing could settle, shown as it was read. */
export interface DataRowNote {
  kind: 'read-as';
  column: string;
}

export interface DataCsvRow {
  index: number;
  values: Record<string, string | null>;
  money: Record<string, number | null>;
  issues: DataRowIssue[];
  notes: DataRowNote[];
}

export type AmountUnit = 'decimal' | 'minor';
export type UnitReason = 'marker' | 'old-export' | 'default';

export type DataCsvResult =
  | { ok: true; table: DataTable; columns: string[]; rows: DataCsvRow[]; unit: AmountUnit; unitReason: UnitReason }
  | {
      ok: false;
      error: 'empty' | 'unreadable' | 'too-many-rows' | 'header-mismatch';
      missing?: string[];
      unknown?: string[];
      /** 10-review (D-6): a column named more than once; which value wins would be a guess. */
      duplicate?: string[];
    };

export interface ParseOptions {
  /** A currency's decimals; defaults to the ISO rule. The screen passes one that knows the person's custom currencies. */
  exponentOf?: (currency: string) => number;
  /** The device's decimal mark, the third tie-breaker for a "1,234" nothing else settles (amount.ts resolveCell). */
  deviceDecimal?: string;
}

export type RowMatch = 'new' | 'same-id' | 'same-name';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE = /^-?\d+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
/** Columns only Export writes; the template and hand-made files leave them out (10-review-2 D-1 rule b). */
const EXPORT_ONLY = ['id', 'household_id', 'created_at', 'updated_at'] as const;
const IGNORED = new Set([
  'household_id', 'created_by', 'deleted_at', 'created_at', 'updated_at', 'check_id', 'series_id', 'extra_series_id', 'tombstone_of',
  AMOUNT_FORMAT_COLUMN,
]);

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

type MoneyOutcome = { minor: number; note?: true } | { issue: 'bad-amount' | 'extra-decimals' | 'mixed-format' };

/** Older exports: integer minor units exactly as stored. */
function readMinor(cell: string): MoneyOutcome {
  if (!WHOLE.test(cell)) return { issue: 'bad-amount' };
  const minor = Number.parseInt(cell, 10);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_ABS_AMOUNT_MINOR) return { issue: 'bad-amount' };
  return { minor };
}

/** The mark most cells prove; a tie goes to the device's mark when it is one of the two, else none. */
function majority(counts: Record<Mark, number>, deviceDecimal: string | undefined): Mark | null {
  if (counts[','] > counts['.']) return ',';
  if (counts['.'] > counts[',']) return '.';
  if (counts[','] > 0 && (deviceDecimal === ',' || deviceDecimal === '.')) return deviceDecimal;
  return null;
}

type Values = Record<string, string | null>;

function decideUnit(header: readonly string[], raws: readonly Values[], moneyCols: readonly string[]): { unit: AmountUnit; reason: UnitReason } {
  if (header.includes(AMOUNT_FORMAT_COLUMN)) {
    const marked = raws.map((v) => v[AMOUNT_FORMAT_COLUMN]?.trim().toLowerCase()).find((v) => v !== undefined);
    if (marked === 'decimal' || marked === 'minor') return { unit: marked, reason: 'marker' };
    return { unit: 'decimal', reason: 'default' };
  }
  const oldExport =
    raws.length > 0 &&
    EXPORT_ONLY.every((c) => header.includes(c)) &&
    raws.every((v) => {
      const id = v.id;
      if (id === null || id === undefined || !UUID.test(id)) return false;
      return moneyCols.every((c) => {
        const cell = v[c];
        return cell === null || cell === undefined || WHOLE.test(cell.trim());
      });
    });
  return oldExport ? { unit: 'minor', reason: 'old-export' } : { unit: 'decimal', reason: 'default' };
}

export function parseDataCsv(table: DataTable, text: string, opts: ParseOptions = {}): DataCsvResult {
  const schema = DATA_CSV_SCHEMAS[table];
  const exponentOf = opts.exponentOf ?? currencyExponent;
  const tok = tokenize(text);
  if (!tok.ok) {
    if (tok.error === 'empty') return { ok: false, error: 'empty' };
    if (tok.error === 'too-many-rows') return { ok: false, error: 'too-many-rows' };
    return { ok: false, error: 'unreadable' };
  }

  const header = (tok.rows[0] as string[]).map((h) => h.trim().toLowerCase());
  const allowed = new Set([...schema.allowed, AMOUNT_FORMAT_COLUMN]);
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

  const moneyCols = header.filter((c) => schema.money.includes(c));
  const dateCols = new Set(schema.dates);

  // Every cell, export-only columns included: rule (b) reads them before they are dropped from a row's values.
  const raws: Values[] = [];
  for (let r = 1; r < tok.rows.length; r += 1) {
    const cells = tok.rows[r] as string[];
    const values: Values = {};
    header.forEach((col, i) => {
      const raw = unescapeCell(cells[i] ?? '');
      values[col] = raw.trim() === '' ? null : raw;
    });
    raws.push(values);
  }
  const { unit, reason } = decideUnit(header, raws, moneyCols);

  // 10-review-2 (D-2): every amount cell is read on its own first; then each column's (else the file's) proven mark.
  const shapes = raws.map((v) => {
    const out: Record<string, CellShape> = {};
    for (const col of moneyCols) {
      const cell = v[col];
      if (cell !== null && cell !== undefined) out[col] = shapeCell(cell);
    }
    return out;
  });
  const fileCounts: Record<Mark, number> = { ',': 0, '.': 0 };
  const colCounts = new Map<string, Record<Mark, number>>(moneyCols.map((c) => [c, { ',': 0, '.': 0 }]));
  for (const byCol of shapes) {
    for (const [col, shape] of Object.entries(byCol)) {
      if (shape.kind !== 'sure' || shape.proves === null) continue;
      fileCounts[shape.proves] += 1;
      (colCounts.get(col) as Record<Mark, number>)[shape.proves] += 1;
    }
  }
  // A marked file is Export's canonical form, so its default mark is the dot ("1.250" KWD is 1.25, not 1250).
  const fileMark = majority(fileCounts, opts.deviceDecimal) ?? (reason === 'marker' ? '.' : null);
  const convention = new Map<string, Mark | null>(
    moneyCols.map((c) => [c, majority(colCounts.get(c) as Record<Mark, number>, opts.deviceDecimal) ?? fileMark]),
  );

  const readDecimal = (col: string, shape: CellShape, currency: string): MoneyOutcome => {
    const mark = convention.get(col) ?? null;
    if (shape.kind === 'sure' && shape.proves !== null && mark !== null && shape.proves !== mark) return { issue: 'mixed-format' };
    const exponent = exponentOf(currency);
    const resolved = resolveCell(shape, { convention: mark, exponent, deviceDecimal: opts.deviceDecimal });
    if (!resolved.ok) return { issue: 'bad-amount' };
    const out = toMinor(resolved.negative, resolved.whole, resolved.fraction, exponent);
    if ('issue' in out) return out;
    return resolved.resolution === 'guess' ? { minor: out.minor, note: true } : out;
  };

  const rows: DataCsvRow[] = raws.map((raw, r) => {
    const values: Values = {};
    for (const col of header) if (!IGNORED.has(col)) values[col] = raw[col] as string | null;

    const issues: DataRowIssue[] = [];
    const notes: DataRowNote[] = [];
    const add = (i: DataRowIssue) => {
      if (!issues.includes(i)) issues.push(i);
    };

    if (values.name === null || values.name === undefined) add('name-missing');
    const currency = values[schema.currencyColumn];
    if (currency === null || currency === undefined) add('currency-missing');
    if (values.id !== null && values.id !== undefined && !UUID.test(values.id)) add('bad-id');

    const money: Record<string, number | null> = {};
    for (const col of moneyCols) {
      const cell = values[col];
      if (cell === null || cell === undefined) {
        money[col] = null;
        if (schema.required.includes(col)) add('bad-amount');
        continue;
      }
      const out =
        unit === 'minor' ? readMinor(cell.trim()) : readDecimal(col, (shapes[r] as Record<string, CellShape>)[col] as CellShape, currency?.trim() ?? '');
      if ('issue' in out) {
        money[col] = null;
        add(out.issue);
      } else {
        money[col] = out.minor;
        if (out.note) notes.push({ kind: 'read-as', column: col });
      }
    }

    for (const col of header) {
      const cell = values[col];
      if (cell === null || cell === undefined) continue;
      if (dateCols.has(col) && !validDate(cell.trim())) add('bad-date');
      const choices = schema.enums[col];
      if (choices && !choices.includes(cell.trim())) add('bad-choice');
    }

    return { index: r, values, money, issues, notes };
  });

  return { ok: true, table, columns: header, rows, unit, unitReason: reason };
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
