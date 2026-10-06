// The generic version-checked bulk-write primitive (REC-11, REC-12, ACT-05, D-24, D-26,
// D-50): every bulk action and every undo replay serialises to the same `PatchOp[]` shape
// and goes through `applyPatches`, which wraps the server's `apply_patches` RPC (plan 02-09).
// This is the one write path mutation plans 02-15..02-18 call -- they never call the RPC
// directly, or make a raw table write for a multi-row change.
//
// Response contract (plan 02-09 <interfaces>):
//   applied  -> {"status":"applied","rows":[{"entity","id","version"}]}
//   conflict -> {"status":"conflict","conflict":{"entity","id","updated_by","record_name","builtin_key","reason"}}
// A conflict is surfaced as the same `VersionConflictError` Phase 1 already uses (D-26), with
// the parsed `UndoConflict` (camelCase) as its `serverRow` -- callers narrow on
// `err.serverRow` when they need the refusal copy (who changed what).

import type { PatchOp, PatchValue, UndoConflict, UndoEntity, UndoLabelParams, UndoStepDraft } from '@/engine/undo';
import { DbError, VersionConflictError, toDbError } from './errors';
import type { DbClient } from './rows';

/** A single applied row from `apply_patches`'s "applied" envelope. */
export interface AppliedRow {
  entity: UndoEntity;
  id: string;
  version: number;
}

export interface SerialisedOp {
  entity: string;
  id: string;
  expectedVersion: number;
  patch: Record<string, PatchValue>;
}

export interface SerialisedStep {
  id: string;
  label_key: string;
  label_params: UndoLabelParams;
  ops: SerialisedOp[];
}

/** `apply_patches`/`apply_undo_step`/`rollback_undo_to` returned a shape this module cannot validate (T-02-13-01). */
export const BAD_RESPONSE = 'bad-response';

const UNDO_ENTITIES: readonly UndoEntity[] = ['transactions', 'categories', 'recurring_series', 'accounts'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUndoEntity(value: unknown): value is UndoEntity {
  return typeof value === 'string' && (UNDO_ENTITIES as readonly string[]).includes(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function badResponse(context: string): DbError {
  return new DbError(`apply_patches response: ${context}`, BAD_RESPONSE, null);
}

/**
 * Serialises a `PatchOp[]` into exactly the JSON shape `apply_patches` (plan 02-09) expects.
 * D-CR-02: throws `RangeError` for any op whose `expectedVersion` is not a positive integer,
 * so a version-less op is refused here rather than sent as an unchecked write.
 */
export function serialiseOps(ops: readonly PatchOp[]): SerialisedOp[] {
  for (const op of ops) {
    const version: unknown = op.expectedVersion;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new RangeError(`serialiseOps: op on ${String(op.entity)} ${String(op.id)} has no valid expectedVersion`);
    }
  }
  return ops.map((op) => ({
    entity: op.entity,
    id: op.id,
    expectedVersion: op.expectedVersion,
    patch: { ...op.patch },
  }));
}

/** Serialises an `UndoStepDraft` into the `p_undo_step` shape `apply_patches` expects. */
export function serialiseStep(step: UndoStepDraft): SerialisedStep {
  return {
    id: step.id,
    label_key: step.labelKey,
    label_params: step.labelParams,
    ops: serialiseOps(step.ops),
  };
}

/** Maps `apply_patches`'s `conflict` object (snake_case) to the engine's `UndoConflict` (camelCase). Throws `DbError(BAD_RESPONSE)` on a malformed shape (T-02-13-01). */
export function parseConflict(json: unknown): UndoConflict {
  if (!isRecord(json)) throw badResponse('conflict is not an object');

  const { entity, id, updated_by: updatedBy, record_name: recordName, builtin_key: builtinKey, reason } = json;

  if (!isUndoEntity(entity)) throw badResponse('malformed conflict.entity');
  if (typeof id !== 'string' || id.length === 0) throw badResponse('malformed conflict.id');
  if (!isNullableString(updatedBy)) throw badResponse('malformed conflict.updated_by');
  if (!isNullableString(recordName)) throw badResponse('malformed conflict.record_name');
  if (!isNullableString(builtinKey)) throw badResponse('malformed conflict.builtin_key');
  if (reason !== 'changed' && reason !== 'not-found') throw badResponse('malformed conflict.reason');

  return { entity, id, updatedBy, recordName, builtinKey, reason };
}

function isAppliedRow(value: unknown): value is AppliedRow {
  return isRecord(value) && isUndoEntity(value.entity) && typeof value.id === 'string' && typeof value.version === 'number';
}

/**
 * REC-11/REC-12/ACT-05/D-50: sends a version-checked op list (a bulk delete, a bulk mark
 * paid/unpaid, a merge, a transfer create/edit/delete, or an undo replay) as one atomic RPC,
 * optionally carrying its own undo step so the forward write and its inverse commit together
 * (D-24). A conflict is refused as a whole -- no row changes -- and surfaces as a
 * `VersionConflictError` whose `serverRow` is the parsed `UndoConflict` (D-26).
 */
export async function applyPatches(
  client: DbClient,
  ops: readonly PatchOp[],
  undoStep?: UndoStepDraft | null
): Promise<AppliedRow[]> {
  const { data, error, status } = await client.rpc('apply_patches', {
    p_ops: serialiseOps(ops),
    p_undo_step: undoStep ? serialiseStep(undoStep) : null,
  });

  if (error) throw toDbError(error, status);
  if (!isRecord(data)) throw badResponse('not an object');

  switch (data.status) {
    case 'applied': {
      const rows = data.rows;
      if (!Array.isArray(rows) || !rows.every(isAppliedRow)) throw badResponse('malformed rows');
      return rows;
    }
    case 'conflict': {
      const conflict = parseConflict(data.conflict);
      throw new VersionConflictError(conflict.entity, conflict.id, conflict);
    }
    default:
      throw badResponse(`unrecognised status ${JSON.stringify(data.status)}`);
  }
}
