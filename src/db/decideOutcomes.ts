// 05-05: client side of record_decide_go / record_decide_outcome (05-04). JSON-only payloads
// (no bigint): every money field is an integer minor-unit number within the server's bounds.
//
// record_decide_go(p_check_id, p_rows, p_series, p_end_series, p_debt, p_decision, p_undo_step)
//   -> { status: 'applied' | 'already-applied', undo_step_id }
//   WR-A02 (20261021000100): the row-payload overload. The server inserts the rows in the same transaction as
//   the decision, so a refusal leaves nothing behind; the old row-id overload (rows inserted first in a
//   separate request) is no longer called.
// record_decide_outcome(p_check_id, p_outcome 'wait' | 'pass', p_decision)
//   -> { status: 'applied' | 'already-applied' }

import { DbError, toDbError } from './errors';
import type { NewRecurringSeries } from './recurringSeries';
import { BAD_RESPONSE } from './recurringSeries';
import { assertAllowedKeys, type DbClient, type NewTransaction } from './rows';

export const DECIDE_GO_MAX_ROWS = 60;
export const DECIDE_GO_MAX_SERIES = 24;

/** The transaction keys the row-payload overload accepts (20261021000100); the server refuses any other key. */
export const DECIDE_GO_ROW_KEYS = [
  'id',
  'household_id',
  'account_id',
  'original_amount',
  'original_currency',
  'local_date',
  'time_zone',
  'note',
  'name',
  'category_id',
  'payment_type',
  'status',
  'transfer_id',
  'one_off',
] as const satisfies readonly (keyof NewTransaction)[];

export interface DecideGoDebt {
  id: string;
  account_id: string | null;
  series_id: string | null;
  name: string;
  kind: 'loan';
  currency: string;
  balance: number;
  apr: string | null;
  minimum_payment: number;
  secured: boolean;
  term_months: number | null;
  start_date: string | null;
}

export interface DecideGoEndSeries {
  id: string;
  expected_version: number;
  end_date: string;
}

export type DecideLinkRole = 'day_one' | 'payment' | 'running_cost';

// Part 2: D-35, D-36, 04 D-48.
export interface DecideGoDecision {
  verdict: 'fits' | 'adjust' | 'no' | 'missing';
  estimate_day_one: number;
  estimate_monthly: number;
  estimate_monthly_payment: number;
  estimate_running: number;
  broke_line: boolean;
  cooling_off: boolean;
  row_roles: readonly DecideLinkRole[];
  series_roles: readonly DecideLinkRole[];
}

export interface DecideGoInput {
  checkId: string;
  /** The pending rows Go ahead writes; the server inserts them (client uuids, so a replay never doubles them). */
  rows: readonly NewTransaction[];
  series: readonly NewRecurringSeries[];
  endSeries: readonly DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
  undo: { id: string; labelKey: 'decisionWritten'; labelParams: { name?: string } };
}

export type DecideGoResult = { status: 'applied' | 'already-applied'; undoStepId: string };

/** Go ahead: one RPC (one transaction) writes the rows, series, debt and decision and records a single undo step. */
export async function recordDecideGo(client: DbClient, input: DecideGoInput): Promise<DecideGoResult> {
  const { rows, series, endSeries, debt, decision } = input;

  if (rows.length > DECIDE_GO_MAX_ROWS) {
    throw new RangeError(`recordDecideGo: at most ${DECIDE_GO_MAX_ROWS} rows, got ${rows.length}`);
  }
  if (series.length > DECIDE_GO_MAX_SERIES) {
    throw new RangeError(`recordDecideGo: at most ${DECIDE_GO_MAX_SERIES} series, got ${series.length}`);
  }
  if (endSeries.length > DECIDE_GO_MAX_SERIES) {
    throw new RangeError(`recordDecideGo: at most ${DECIDE_GO_MAX_SERIES} ended series, got ${endSeries.length}`);
  }
  if (rows.length + series.length === 0 && debt === null) {
    throw new RangeError('recordDecideGo: nothing to write');
  }
  if (decision.row_roles.length !== rows.length) {
    throw new RangeError('recordDecideGo: row_roles must match rows one to one');
  }
  if (decision.series_roles.length !== series.length) {
    throw new RangeError('recordDecideGo: series_roles must match series one to one');
  }
  const rowPayloads = rows.map((tx) => {
    assertAllowedKeys(tx as unknown as Record<string, unknown>, DECIDE_GO_ROW_KEYS, 'recordDecideGo');
    const row: Record<string, unknown> = {};
    for (const key of DECIDE_GO_ROW_KEYS) {
      if (tx[key] !== undefined) row[key] = tx[key];
    }
    return row;
  });

  const { data, error, status } = await client.rpc('record_decide_go', {
    p_check_id: input.checkId,
    p_rows: rowPayloads,
    p_series: series,
    p_end_series: endSeries,
    p_debt: debt,
    p_decision: {
      verdict: decision.verdict,
      estimate_day_one: decision.estimate_day_one,
      estimate_monthly: decision.estimate_monthly,
      estimate_monthly_payment: decision.estimate_monthly_payment,
      estimate_running: decision.estimate_running,
      broke_line: decision.broke_line,
      cooling_off: decision.cooling_off,
      row_roles: decision.row_roles,
      series_roles: decision.series_roles,
    },
    p_undo_step: { id: input.undo.id, label_key: input.undo.labelKey, label_params: input.undo.labelParams },
  });
  if (error) throw toDbError(error, status);

  const rec = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const state = rec.status;
  const undoStepId = rec.undo_step_id;
  if ((state !== 'applied' && state !== 'already-applied') || typeof undoStepId !== 'string' || undoStepId.length === 0) {
    throw new DbError(`record_decide_go response: unrecognised ${JSON.stringify(state)}`, BAD_RESPONSE, null);
  }
  return { status: state, undoStepId };
}

// D-34: target >= 1 (WaitPlan.target); null when nothing is left to save.
export interface DecideWaitGoal {
  id: string;
  name: string;
  currency: string;
  target: number;
}

export type DecideOutcomeDecision =
  | {
      outcome: 'wait';
      verdict: DecideGoDecision['verdict'];
      wait_monthly: number;
      ready_by: string | null;
      cooling_off: boolean;
      goal: DecideWaitGoal | null;
    }
  | { outcome: 'pass'; verdict: DecideGoDecision['verdict']; cooling_off: boolean };

/** Wait or Pass: records the outcome on the check. No undo step (D-11). */
export async function recordDecideOutcome(
  client: DbClient,
  checkId: string,
  decision: DecideOutcomeDecision
): Promise<{ status: 'applied' | 'already-applied' }> {
  let payload: Record<string, unknown>;
  if (decision.outcome === 'wait') {
    if (!Number.isSafeInteger(decision.wait_monthly) || decision.wait_monthly < 0) {
      throw new RangeError('recordDecideOutcome: wait_monthly must be a non-negative integer');
    }
    if (decision.goal !== null && (!Number.isSafeInteger(decision.goal.target) || decision.goal.target < 1)) {
      throw new RangeError('recordDecideOutcome: a goal target must be an integer of at least 1');
    }
    payload = {
      verdict: decision.verdict,
      wait_monthly: decision.wait_monthly,
      ready_by: decision.ready_by,
      cooling_off: decision.cooling_off,
      goal: decision.goal,
    };
  } else {
    payload = { verdict: decision.verdict, cooling_off: decision.cooling_off };
  }

  const { data, error, status } = await client.rpc('record_decide_outcome', {
    p_check_id: checkId,
    p_outcome: decision.outcome,
    p_decision: payload,
  });
  if (error) throw toDbError(error, status);

  const state = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).status : undefined;
  if (state !== 'applied' && state !== 'already-applied') {
    throw new DbError(`record_decide_outcome response: unrecognised ${JSON.stringify(state)}`, BAD_RESPONSE, null);
  }
  return { status: state };
}
