// 06-14: client side of save_debt_plan and record_debt_sale (06-07, migration 20261106000300).
// JSON-only payloads: every money field is an integer minor-unit number.
//
// save_debt_plan(p_debt_id, p_expected_version, p_extra, p_order, p_series, p_undo_step)
//   -> { status: 'applied' | 'already-applied' | 'conflict', series_id, undo_step_id }
//   p_series is required when p_extra > 0 (the amount comes from p_extra); extra 0 sends null.
// record_debt_sale(p_debt_id, p_expected_version, p_sale, p_payment, p_undo_step)
//   -> { status: 'applied', paid_off, still_owed, undo_step_id } | { status: 'already-applied' } | { status: 'conflict' }
//
// Both RPCs build the undo step's ops on the server: p_undo_step is only { id, label_key, label_params: { name } }.

import { DbError, VersionConflictError, toDbError } from './errors';
import { BAD_RESPONSE } from './recurringSeries';
import type { DbClient } from './rows';

const MAX_MINOR = 10_000_000_000_000;

/** The Expected monthly extra payment record. The amount is taken from `extra` on the server. */
export interface DebtPlanSeries {
  id: string;
  account_id: string;
  anchor_date: string;
  time_zone: string;
  name: string;
  category_id: string | null;
}

export interface SaveDebtPlanInput {
  debtId: string;
  expectedVersion: number;
  /** Minor units a month on top of the minimums; 0 clears the extra. */
  extra: number;
  order: 'rate' | 'balance' | null;
  /** Required when extra > 0; null when extra is 0. */
  series: DebtPlanSeries | null;
  undoStep: { id: string; name: string };
}

export interface SaveDebtPlanResult {
  status: 'applied' | 'already-applied';
  seriesId: string | null;
  undoStepId: string;
}

/** One side of a sale: money in (the sale) or out (the final payment). `amount` is positive. */
export interface DebtSaleLeg {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  local_date: string;
  time_zone: string;
  name: string;
  category_id?: string | null;
}

export interface RecordDebtSaleInput {
  debtId: string;
  expectedVersion: number;
  sale: DebtSaleLeg;
  /** The final payment toward the loan; null records the sale alone. */
  payment: DebtSaleLeg | null;
  undoStep: { id: string; name: string };
}

export interface RecordDebtSaleResult {
  status: 'applied' | 'already-applied';
  /** null when the call had already been applied: read the debt again. */
  paidOff: boolean | null;
  stillOwed: number | null;
  undoStepId: string;
}

function rec(data: unknown, fn: string): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) throw new DbError(`${fn} response: not an object`, BAD_RESPONSE, null);
  return data as Record<string, unknown>;
}

function undoIdOf(r: Record<string, unknown>, fn: string): string {
  const id = r.undo_step_id;
  if (typeof id !== 'string' || id.length === 0) throw new DbError(`${fn} response: no undo step id`, BAD_RESPONSE, null);
  return id;
}

function assertLeg(leg: DebtSaleLeg, where: string): void {
  if (!Number.isSafeInteger(leg.amount) || leg.amount < 1 || leg.amount > MAX_MINOR) {
    throw new RangeError(`${where}: amount must be a positive integer`);
  }
}

export async function saveDebtPlan(client: DbClient, input: SaveDebtPlanInput): Promise<SaveDebtPlanResult> {
  if (!Number.isSafeInteger(input.extra) || input.extra < 0 || input.extra > MAX_MINOR) {
    throw new RangeError('saveDebtPlan: the extra must be a whole amount of 0 or more');
  }
  if (input.extra > 0 && input.series === null) throw new RangeError('saveDebtPlan: an extra payment needs its monthly record');
  const { data, error, status } = await client.rpc('save_debt_plan', {
    p_debt_id: input.debtId,
    p_expected_version: input.expectedVersion,
    p_extra: input.extra,
    p_order: input.order,
    p_series: input.extra > 0 ? input.series : null,
    p_undo_step: { id: input.undoStep.id, label_key: 'debtPlanSaved', label_params: { name: input.undoStep.name } },
  });
  if (error) throw toDbError(error, status);
  const r = rec(data, 'save_debt_plan');
  if (r.status === 'conflict') throw new VersionConflictError('debts', input.debtId, null);
  if (r.status !== 'applied' && r.status !== 'already-applied') {
    throw new DbError(`save_debt_plan response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return {
    status: r.status,
    seriesId: typeof r.series_id === 'string' && r.series_id.length > 0 ? r.series_id : null,
    undoStepId: undoIdOf(r, 'save_debt_plan'),
  };
}

export async function recordDebtSale(client: DbClient, input: RecordDebtSaleInput): Promise<RecordDebtSaleResult> {
  assertLeg(input.sale, 'recordDebtSale sale');
  if (input.payment !== null) assertLeg(input.payment, 'recordDebtSale payment');
  const { data, error, status } = await client.rpc('record_debt_sale', {
    p_debt_id: input.debtId,
    p_expected_version: input.expectedVersion,
    p_sale: input.sale,
    p_payment: input.payment,
    p_undo_step: { id: input.undoStep.id, label_key: 'debtSaleRecorded', label_params: { name: input.undoStep.name } },
  });
  if (error) throw toDbError(error, status);
  const r = rec(data, 'record_debt_sale');
  if (r.status === 'conflict') throw new VersionConflictError('debts', input.debtId, null);
  if (r.status !== 'applied' && r.status !== 'already-applied') {
    throw new DbError(`record_debt_sale response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return {
    status: r.status,
    paidOff: typeof r.paid_off === 'boolean' ? r.paid_off : null,
    stillOwed: typeof r.still_owed === 'number' && Number.isInteger(r.still_owed) ? r.still_owed : null,
    undoStepId: undoIdOf(r, 'record_debt_sale'),
  };
}
