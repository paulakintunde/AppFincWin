// 05-05: typed reads and writes for decide_checks (05-03). Inputs only, never a verdict (D-15).
// *_KEYS mirror the SQL grants exactly; status/decision columns are written only by
// record_decide_go / record_decide_outcome.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export type DecideCheckStatus = 'open' | 'bought' | 'waiting' | 'passed';
export type SeenState = 'fits' | 'adjust' | 'no' | 'missing';
export type SeenBasis = 'logged_months' | 'first_read_rough_figures';

export interface DecideCheckRow {
  id: string;
  household_id: string;
  created_by: string;
  kind: 'buy' | 'invest';
  name: string;
  inputs: Record<string, unknown>;
  status: DecideCheckStatus;
  furthest_step: number;
  last_seen_state: SeenState | null;
  last_seen_basis: SeenBasis | null;
  reopened_from: string | null;
  decided_at: string | null;
  verdict_at_decision: SeenState | null;
  estimate_day_one: number | null;
  estimate_monthly: number | null;
  wait_monthly: number | null;
  ready_by: string | null;
  broke_line: boolean;
  // Part 2 (05-32): read-only, RPC-written.
  cooling_off_at: string | null;
  estimate_monthly_payment: number | null;
  estimate_running: number | null;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DECIDE_CHECK_COLUMNS =
  'id, household_id, created_by, kind, name, inputs, status, furthest_step, last_seen_state, last_seen_basis, reopened_from, decided_at, verdict_at_decision, estimate_day_one, estimate_monthly, wait_monthly, ready_by, broke_line, cooling_off_at, estimate_monthly_payment, estimate_running, is_sample, deleted_at, version, updated_by, created_at, updated_at';

export interface NewDecideCheck {
  id: string;
  household_id: string;
  kind: 'buy' | 'invest';
  name: string;
  inputs: Record<string, unknown>;
  furthest_step: number;
  last_seen_state?: SeenState | null;
  last_seen_basis?: SeenBasis | null;
  reopened_from?: string | null;
}

// kind: updatable while open (05-03 grant + guard), always equal to inputs.kind.
export type DecideCheckPatch = Partial<{
  kind: 'buy' | 'invest';
  name: string;
  inputs: Record<string, unknown>;
  furthest_step: number;
  last_seen_state: SeenState | null;
  last_seen_basis: SeenBasis | null;
  deleted_at: string | null;
}>;

export const DECIDE_CHECK_INSERT_KEYS = [
  'id',
  'household_id',
  'kind',
  'name',
  'inputs',
  'furthest_step',
  'last_seen_state',
  'last_seen_basis',
  'reopened_from',
] as const satisfies readonly (keyof NewDecideCheck)[];

export const DECIDE_CHECK_PATCH_KEYS = [
  'kind',
  'name',
  'inputs',
  'furthest_step',
  'last_seen_state',
  'last_seen_basis',
  'deleted_at',
] as const satisfies readonly (keyof DecideCheckPatch)[];

const ENTITY = 'decide_checks' as const;
const UNIQUE_VIOLATION = '23505';

/** Live checks in one household, newest-updated first (RLS keeps them the caller's own; WR-A05 the household). */
export async function fetchDecideChecks(client: DbClient, householdId: string): Promise<DecideCheckRow[]> {
  const { data, error, status } = await client
    .from('decide_checks')
    .select(DECIDE_CHECK_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw toDbError(error, status);
  return (data as DecideCheckRow[] | null) ?? [];
}

/** A live check by id, or null. */
export async function fetchDecideCheck(client: DbClient, id: string): Promise<DecideCheckRow | null> {
  const { data, error, status } = await client
    .from('decide_checks')
    .select(DECIDE_CHECK_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as DecideCheckRow | null) ?? null;
}

export async function insertDecideCheck(client: DbClient, row: NewDecideCheck): Promise<DecideCheckRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DECIDE_CHECK_INSERT_KEYS, 'insertDecideCheck');

  const { data, error, status } = await client.from('decide_checks').insert(row).select(DECIDE_CHECK_COLUMNS).single();
  if (!error) return data as DecideCheckRow;

  // MON-08: a duplicate client id means this exact write already landed (replay).
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDecideCheck(client, row.id);
    if (existing) return existing;
    // IN-B05: decide_checks_reopened_once allows one live check reopened from a decision. Another device got there
    // first: the answer is that check, which the caller opens instead of the one it tried to write.
    if (row.reopened_from) {
      const reopened = await fetchReopenedCheck(client, row.reopened_from);
      if (reopened) return reopened;
    }
  }
  throw toDbError(error, status);
}

/** IN-B05: the live check reopened from a decision, or null. */
export async function fetchReopenedCheck(client: DbClient, decisionId: string): Promise<DecideCheckRow | null> {
  const { data, error, status } = await client
    .from('decide_checks')
    .select(DECIDE_CHECK_COLUMNS)
    .eq('reopened_from', decisionId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as DecideCheckRow | null) ?? null;
}

/**
 * Autosave of an open draft: last write wins on the owner's own check (A5). Not version
 * conditional. When inputs.kind is 'buy' | 'invest' the column follows it in the same statement.
 */
export async function saveDecideCheckDraft(
  client: DbClient,
  id: string,
  patch: Pick<DecideCheckPatch, 'name' | 'inputs' | 'furthest_step'>
): Promise<DecideCheckRow> {
  assertAllowedKeys(patch, ['name', 'inputs', 'furthest_step'], 'saveDecideCheckDraft');

  const payload: DecideCheckPatch = { ...patch };
  const kind = patch.inputs?.kind;
  if (kind === 'buy' || kind === 'invest') payload.kind = kind;

  const { data, error, status } = await client
    .from('decide_checks')
    .update(payload)
    .eq('id', id)
    .eq('status', 'open')
    .select(DECIDE_CHECK_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as DecideCheckRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DecideCheckRow;
  throw new NotFoundError(ENTITY, id);
}

export async function updateDecideCheck(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: DecideCheckPatch
): Promise<DecideCheckRow> {
  assertAllowedKeys(patch, DECIDE_CHECK_PATCH_KEYS, 'updateDecideCheck');

  const { data, error, status } = await client
    .from('decide_checks')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DECIDE_CHECK_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as DecideCheckRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DecideCheckRow;

  const serverRow = await fetchDecideCheck(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
