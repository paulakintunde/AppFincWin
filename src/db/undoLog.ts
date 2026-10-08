// The undo/rollback primitives (REC-11, REC-12, D-23, D-25, D-27, D-28): a per-user,
// server-side stack that survives restarts and follows the user across devices. Every step
// is appended once (never patched by the client -- only `apply_undo_step`/`rollback_undo_to`,
// both definer functions, ever change a step's status) and listed newest-first, 12 deep.
//
// `touched_ids` is filled server-side by a trigger (plan 02-09) from the step's own `ops` --
// the client never supplies it, and this module never sends `owner_id` in a write payload
// either (the column default fills it; RLS's insert check pins it to `auth.uid()`).

import type { UndoConflict, UndoStepDraft } from '@/engine/undo';
import { parseConflict, serialiseStep } from './patches';
import { DbError, toDbError } from './errors';
import { UNDO_LOG_COLUMNS, type DbClient, type UndoLogRow } from './rows';

/** Postgres/PostgREST unique-violation code -- a duplicate client-generated step id (MON-08). */
const UNIQUE_VIOLATION = '23505';

/** `apply_undo_step`/`rollback_undo_to` returned a shape this module cannot validate (T-02-13-01). */
export const BAD_RESPONSE = 'bad-response';

export type UndoOutcome =
  | { status: 'undone' }
  | { status: 'already-undone' }
  | { status: 'refused'; conflict: UndoConflict }
  | { status: 'not-found' };

export type RollbackOutcome =
  | { status: 'undone'; undone: number }
  | { status: 'refused'; undone: number; stepId: string; conflict: UndoConflict }
  | { status: 'blocked'; undone: number; blockedBy: string; conflict: UndoConflict | null }
  | { status: 'not-found' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function badResponse(context: string): DbError {
  return new DbError(`undo RPC response: ${context}`, BAD_RESPONSE, null);
}

/** D-25: the 12 newest available-or-refused steps, newest first. */
export async function fetchUndoLog(client: DbClient, ownerId: string): Promise<UndoLogRow[]> {
  const { data, error, status } = await client
    .from('undo_log')
    .select(UNDO_LOG_COLUMNS)
    .eq('owner_id', ownerId)
    .in('status', ['available', 'refused'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(12);

  if (error) throw toDbError(error, status);
  return (data as UndoLogRow[] | null) ?? [];
}

/**
 * D-24: appends one labelled step (its ops are the inverse of the action that just
 * succeeded). Only `id`, `label_key`, `label_params`, `ops` are ever sent -- never
 * `owner_id` (the column default fills it) and never `touched_ids` (server-derived, plan
 * 02-09). A duplicate id (a retried mutation, or the paused-mutation queue replaying after a
 * flaky first attempt that actually landed) is not an error -- the step is already recorded.
 */
export async function insertUndoStep(client: DbClient, step: UndoStepDraft): Promise<void> {
  const payload = serialiseStep(step);
  const { error, status } = await client.from('undo_log').insert(payload);

  if (!error) return;

  if (error.code === UNIQUE_VIOLATION) {
    const { data, error: fetchError, status: fetchStatus } = await client
      .from('undo_log')
      .select('id')
      .eq('id', step.id)
      .maybeSingle();
    if (fetchError) throw toDbError(fetchError, fetchStatus);
    if (data) return;
  }

  throw toDbError(error, status);
}

/** D-26/D-28: replays one step's ops through `apply_patches` server-side and marks it undone/refused. */
export async function applyUndoStep(client: DbClient, stepId: string): Promise<UndoOutcome> {
  const { data, error, status } = await client.rpc('apply_undo_step', { p_step_id: stepId });

  if (error) throw toDbError(error, status);
  if (!isRecord(data)) throw badResponse('not an object');

  switch (data.status) {
    case 'undone':
      return { status: 'undone' };
    case 'already-undone':
      return { status: 'already-undone' };
    case 'refused':
      return { status: 'refused', conflict: parseConflict(data.refusal) };
    case 'not-found':
      return { status: 'not-found' };
    default:
      throw badResponse(`unrecognised status ${JSON.stringify(data.status)}`);
  }
}

/** D-27: undoes every step from newest back to (and including) `stepId`, stopping at the first conflict or already-refused step; steps already reversed stay reversed. */
export async function rollbackUndoTo(client: DbClient, stepId: string): Promise<RollbackOutcome> {
  const { data, error, status } = await client.rpc('rollback_undo_to', { p_step_id: stepId });

  if (error) throw toDbError(error, status);
  if (!isRecord(data)) throw badResponse('not an object');

  switch (data.status) {
    case 'undone': {
      if (typeof data.undone !== 'number') throw badResponse('malformed undone count');
      return { status: 'undone', undone: data.undone };
    }
    case 'refused': {
      if (typeof data.undone !== 'number') throw badResponse('malformed undone count');
      if (typeof data.step_id !== 'string' || data.step_id.length === 0) throw badResponse('malformed step_id');
      return { status: 'refused', undone: data.undone, stepId: data.step_id, conflict: parseConflict(data.refusal) };
    }
    case 'blocked': {
      if (typeof data.undone !== 'number') throw badResponse('malformed undone count');
      if (typeof data.blocked_by !== 'string' || data.blocked_by.length === 0) throw badResponse('malformed blocked_by');
      const conflict = data.refusal === null || data.refusal === undefined ? null : parseConflict(data.refusal);
      return { status: 'blocked', undone: data.undone, blockedBy: data.blocked_by, conflict };
    }
    case 'not-found':
      return { status: 'not-found' };
    default:
      throw badResponse(`unrecognised status ${JSON.stringify(data.status)}`);
  }
}
