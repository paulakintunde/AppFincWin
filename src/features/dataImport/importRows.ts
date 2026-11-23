/**
 * 10-18 (DAT-03): maps parsed CSV rows (src/engine/dataCsv) to the inputs of the existing queued create mutations. Pure:
 * no React, no I/O. Money cells arrive as integer minor units already (the engine never rounds); nothing here converts
 * them. Ids in the file are never reused (fresh client ids are made by the create hooks), so a file from another account
 * cannot collide with or aim at someone else's rows (T-10-18-02). Foreign keys in the file (account_id, paid_from_account_id)
 * are dropped for the same reason.
 */
import type { AddHoldingInput } from '@/data/mutations/growHoldings';
import type { NewGoalFields } from '@/data/mutations/growGoals';
import type { NewGrowDebtFields } from '@/data/mutations/growDebts';
import type { NewAccount } from '@/db/rows';
import type { HoldingType } from '@/db/holdings';
import type { DataCsvRow, DataRowIssue, DataTable, RowMatch } from '@/engine/dataCsv';

export type ImportAccount = Omit<NewAccount, 'id'>;

export interface ImportContext {
  householdId: string;
  ownerId: string;
  /** The person's home currency, used only when a row's own currency cell is blank (which the parser flags first). */
  homeCurrency: string;
  /** 'YYYY-MM-DD', the person's local today; a holding value dated after it is left undated (the create refuses the future). */
  today: string;
}

export type CreateInput =
  | { table: 'accounts'; row: number; input: ImportAccount }
  | { table: 'savings_goals'; row: number; input: { householdId: string; ownerId: string; fields: NewGoalFields } }
  | { table: 'debts'; row: number; input: { householdId: string; ownerId: string; fields: NewGrowDebtFields } }
  | { table: 'holdings'; row: number; input: AddHoldingInput };

export type RowState = 'ready' | 'check' | 'exists';

export interface RowReport {
  row: DataCsvRow;
  match: RowMatch;
  state: RowState;
  /** Why a row needs a look, first reason only. */
  issue?: DataRowIssue | 'out-of-range';
}

const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const CURRENCY = /^[A-Z0-9]{2,4}$/;
const DATE10 = /^(\d{4}-\d{2}-\d{2})/;

function text(row: DataCsvRow, col: string): string | null {
  const v = row.values[col];
  return v === undefined || v === null ? null : v.trim();
}
function minor(row: DataCsvRow, col: string): number | null {
  const v = row.money[col];
  return v === undefined ? null : v;
}
function flag(row: DataCsvRow, col: string): boolean | undefined {
  const v = text(row, col)?.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}
function date(row: DataCsvRow, col: string): string | null {
  const v = text(row, col);
  if (v === null) return null;
  return DATE10.exec(v)?.[1] ?? null;
}
function nonNeg(n: number | null): boolean {
  return n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_MINOR);
}
function validName(name: string | null): name is string {
  return name !== null && name.length >= 1 && name.length <= 80;
}
function validCurrency(c: string | null): c is string {
  return c !== null && CURRENCY.test(c);
}
function percentOk(v: string | null): boolean {
  if (v === null) return true;
  return /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100;
}

/** null means the row cannot be created as it stands (a value outside what the create accepts). */
function mapAccount(row: DataCsvRow, ctx: ImportContext): ImportAccount | null {
  const name = text(row, 'name');
  const currency = text(row, 'currency');
  const kind = text(row, 'kind') as ImportAccount['kind'] | null;
  if (!validName(name) || !validCurrency(currency) || kind === null) return null;
  const opening = minor(row, 'opening_balance') ?? 0;
  const od = minor(row, 'overdraft_limit');
  const cl = minor(row, 'credit_limit');
  if (!Number.isSafeInteger(opening) || !nonNeg(od) || !nonNeg(cl)) return null;
  const shared = flag(row, 'is_shared');
  return {
    household_id: ctx.householdId,
    name,
    kind,
    currency,
    opening_balance: opening,
    ...(od !== null ? { overdraft_limit: od } : {}),
    ...(cl !== null ? { credit_limit: cl } : {}),
    ...(shared !== undefined ? { is_shared: shared } : {}),
  };
}

function mapGoal(row: DataCsvRow): NewGoalFields | null {
  const name = text(row, 'name');
  const currency = text(row, 'currency');
  const target = minor(row, 'target');
  const monthly = minor(row, 'monthly_amount');
  const saved = minor(row, 'opening_saved') ?? 0;
  if (!validName(name) || !validCurrency(currency) || target === null || target < 1) return null;
  if (!nonNeg(target) || !nonNeg(monthly) || !nonNeg(saved)) return null;
  const protect = flag(row, 'protect');
  const upFront = flag(row, 'up_front_only');
  return {
    name,
    currency,
    locked: flag(row, 'locked') ?? false,
    target,
    ready_by: date(row, 'ready_by'),
    monthly_amount: monthly,
    opening_saved: saved,
    account_id: null,
    ...(protect !== undefined ? { protect } : {}),
    ...(upFront !== undefined ? { up_front_only: upFront } : {}),
  };
}

function mapDebt(row: DataCsvRow): NewGrowDebtFields | null {
  const name = text(row, 'name');
  const currency = text(row, 'currency');
  const kind = text(row, 'kind') as NewGrowDebtFields['kind'] | null;
  const balance = minor(row, 'balance');
  const minimum = minor(row, 'minimum_payment');
  const started = minor(row, 'started_balance');
  const apr = text(row, 'apr');
  const due = text(row, 'due_day');
  const dueDay = due === null ? null : /^\d{1,2}$/.test(due) ? Number(due) : Number.NaN;
  if (!validName(name) || !validCurrency(currency) || kind === null || balance === null) return null;
  if (!nonNeg(balance) || !nonNeg(minimum) || !nonNeg(started) || !percentOk(apr)) return null;
  if (dueDay !== null && !(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31)) return null;
  const pays = text(row, 'pays_in_full');
  const secured = flag(row, 'secured');
  return {
    name,
    kind,
    currency,
    balance,
    apr,
    ...(minimum !== null ? { minimum_payment: minimum } : {}),
    due_day: dueDay,
    ...(started !== null ? { started_balance: started } : {}),
    ...(kind === 'card' && (pays === 'yes' || pays === 'no' || pays === 'sometimes') ? { pays_in_full: pays } : {}),
    account_id: null,
    ...(secured !== undefined ? { secured } : {}),
  };
}

function mapHolding(row: DataCsvRow, ctx: ImportContext): Omit<AddHoldingInput, 'ownerId' | 'householdId'> | null {
  const name = text(row, 'name');
  const currency = text(row, 'currency');
  const type = text(row, 'type') as HoldingType | null;
  const value = minor(row, 'value');
  const put = minor(row, 'opening_put_in') ?? 0;
  const monthly = minor(row, 'monthly_amount');
  const rate = text(row, 'rate');
  const dayText = text(row, 'day');
  const day = dayText === null ? null : /^\d{1,2}$/.test(dayText) ? Number(dayText) : Number.NaN;
  if (!validName(name) || !validCurrency(currency) || type === null || value === null) return null;
  if (!nonNeg(value) || !nonNeg(put) || !nonNeg(monthly) || !percentOk(rate)) return null;
  if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return null;
  const asOf = date(row, 'value_as_of');
  return {
    name,
    type,
    currency,
    value,
    openingPutIn: put,
    ...(asOf !== null && asOf <= ctx.today ? { valueAsOf: asOf } : {}),
    accountId: null,
    paidFromAccountId: null,
    monthlyAmount: monthly,
    day,
    rate,
  };
}

function mapRow(table: DataTable, row: DataCsvRow, ctx: ImportContext): CreateInput | null {
  switch (table) {
    case 'accounts': {
      const input = mapAccount(row, ctx);
      return input ? { table, row: row.index, input } : null;
    }
    case 'savings_goals': {
      const fields = mapGoal(row);
      return fields ? { table, row: row.index, input: { householdId: ctx.householdId, ownerId: ctx.ownerId, fields } } : null;
    }
    case 'debts': {
      const fields = mapDebt(row);
      return fields ? { table, row: row.index, input: { householdId: ctx.householdId, ownerId: ctx.ownerId, fields } } : null;
    }
    case 'holdings': {
      const input = mapHolding(row, ctx);
      return input ? { table, row: row.index, input: { ...input, ownerId: ctx.ownerId, householdId: ctx.householdId } } : null;
    }
  }
}

/** One report per row: ready, needs a look (with the first reason), or already exists (skipped unless overridden). */
export function reportRows(
  table: DataTable,
  rows: readonly DataCsvRow[],
  matches: readonly RowMatch[],
  ctx: ImportContext,
): RowReport[] {
  return rows.map((row, i) => {
    const match = matches[i] ?? 'new';
    const first = row.issues[0];
    if (first !== undefined) return { row, match, state: 'check', issue: first };
    if (mapRow(table, row, ctx) === null) return { row, match, state: 'check', issue: 'out-of-range' };
    return { row, match, state: match === 'new' ? 'ready' : 'exists' };
  });
}

/**
 * The create inputs for the rows to write: every ready row, plus an 'exists' row only when its index is in `overrides`.
 * A row with a problem is never written.
 */
export function toCreateInputs(
  table: DataTable,
  rows: readonly DataCsvRow[],
  matches: readonly RowMatch[],
  ctx: ImportContext,
  overrides: ReadonlySet<number> = new Set(),
): CreateInput[] {
  const out: CreateInput[] = [];
  for (const report of reportRows(table, rows, matches, ctx)) {
    if (report.state === 'check') continue;
    if (report.state === 'exists' && !overrides.has(report.row.index)) continue;
    const created = mapRow(table, report.row, ctx);
    if (created !== null) out.push(created);
  }
  return out;
}
