/**
 * Inverse builders for every undoable mutation kind (REC-11, D-23). Each function here
 * is pure: given the *result* of a forward write (the ids, the versions it left behind,
 * and -- for a patch -- the values it overwrote), it returns the `PatchOp`s that reverse
 * it. Nothing here talks to the server; plan 02-09's `apply_patches` RPC is the only
 * thing that ever executes these ops, and it re-checks every `expectedVersion` itself
 * (T-02-05-01) -- this module's only job is to compute the right ops in the right order.
 *
 * Ordering inside `inverseOfSeriesChange` is load-bearing (T-02-05-02): new occurrence
 * rows must be soft-deleted *before* older ones are restored, because the server's
 * partial unique index on `(recurring_series_id, occurrence_date) where deleted_at is
 * null` would otherwise reject the all-or-nothing apply.
 */
import { assertNever } from '../guards/assertNever';
import {
  MAX_UNDO_OPS,
  NOW_SENTINEL,
  type PatchOp,
  type PatchValue,
  type SeriesChangeSet,
  type UndoEntity,
  type UndoLabelKey,
  type UndoLabelParams,
  type UndoStepDraft,
} from './types';

function assertValidVersion(version: number, context: string): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError(`${context}: version must be a positive integer, got ${version}`);
  }
}

/** The patch that reverses an insert of `entity`, per D-23: soft-delete or archive. */
function insertInversePatch(entity: UndoEntity): Readonly<Record<string, PatchValue>> {
  switch (entity) {
    case 'transactions':
    case 'recurring_series':
      return { deleted_at: NOW_SENTINEL };
    case 'categories':
    case 'accounts':
      return { archived_at: NOW_SENTINEL };
    default:
      return assertNever(entity, 'UndoEntity');
  }
}

/**
 * insert -> soft delete (transactions/recurring_series) or archive (categories/accounts).
 * A transfer's two legs are both inserts of `entity: 'transactions'`, so passing both
 * rows here in one call is what makes a transfer create one undo step (D-50).
 */
export function inverseOfInserts(
  entity: UndoEntity,
  rows: readonly { id: string; version: number }[]
): PatchOp[] {
  const patch = insertInversePatch(entity);
  return rows.map((row) => {
    assertValidVersion(row.version, 'inverseOfInserts');
    return { entity, id: row.id, expectedVersion: row.version, patch };
  });
}

/** soft delete -> restore, at the version the delete left behind. */
export function inverseOfSoftDeletes(
  entity: 'transactions' | 'recurring_series',
  rows: readonly { id: string; versionAfter: number }[]
): PatchOp[] {
  return rows.map((row) => {
    assertValidVersion(row.versionAfter, 'inverseOfSoftDeletes');
    return { entity, id: row.id, expectedVersion: row.versionAfter, patch: { deleted_at: null } };
  });
}

/** field edit -> edit back, applying the pre-write snapshot at the post-write version. */
export function inverseOfPatches(
  entity: UndoEntity,
  changes: readonly { id: string; before: Readonly<Record<string, PatchValue>>; versionAfter: number }[]
): PatchOp[] {
  return changes.map((change) => {
    if (Object.keys(change.before).length === 0) {
      throw new RangeError('inverseOfPatches: before must not be empty');
    }
    assertValidVersion(change.versionAfter, 'inverseOfPatches');
    return { entity, id: change.id, expectedVersion: change.versionAfter, patch: change.before };
  });
}

export interface BulkPatchItem {
  entity: UndoEntity;
  id: string;
  expectedVersion: number;
  before: Readonly<Record<string, PatchValue>>;
  patch: Readonly<Record<string, PatchValue>>;
}

/**
 * Builds a bulk edit's forward ops and its inverse ops together (bulk edit -> bulk edit
 * back), so a bulk action and its undo step are always derived from the same snapshot
 * and can be sent atomically. Each (entity, id) may appear once: a second patch on the
 * same row would expect a stale version and its inverse would restore an intermediate
 * state, so it is refused -- merge the patches first (review E-WR-10). With every row
 * distinct the inverse ops are independent of one another, so their order (kept parallel
 * to `forward`) cannot change the restored state.
 */
export function planBulkPatch(items: readonly BulkPatchItem[]): { forward: PatchOp[]; inverse: PatchOp[] } {
  const forward: PatchOp[] = [];
  const inverse: PatchOp[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    assertValidVersion(item.expectedVersion, 'planBulkPatch');
    const key = `${item.entity}\u0000${item.id}`;
    if (seen.has(key)) {
      throw new RangeError(`planBulkPatch: ${item.entity} row appears more than once`);
    }
    seen.add(key);
    const patchKeys = Object.keys(item.patch);
    if (patchKeys.length === 0) {
      throw new RangeError('planBulkPatch: patch must not be empty');
    }

    const inversePatch: Record<string, PatchValue> = {};
    for (const key of patchKeys) {
      if (!(key in item.before)) {
        throw new RangeError(`planBulkPatch: before is missing patched key "${key}"`);
      }
      inversePatch[key] = item.before[key]!;
    }

    forward.push({ entity: item.entity, id: item.id, expectedVersion: item.expectedVersion, patch: item.patch });
    inverse.push({
      entity: item.entity,
      id: item.id,
      expectedVersion: item.expectedVersion + 1,
      patch: inversePatch,
    });
  }

  return { forward, inverse };
}

/**
 * series create/edit/end -> the exact reversal of its change set (D-23). Op order is
 * fixed and load-bearing (T-02-05-02, see module doc): inserted rows are deleted first,
 * then soft-deleted rows are restored, then linked rows are unlinked, and the series
 * template patch (or its delete, if the series itself was created) goes last.
 */
export function inverseOfSeriesChange(cs: SeriesChangeSet): PatchOp[] {
  const ops: PatchOp[] = [
    ...inverseOfInserts('transactions', cs.inserted),
    ...inverseOfSoftDeletes('transactions', cs.softDeleted),
  ];

  for (const row of cs.linked) {
    assertValidVersion(row.versionAfter, 'inverseOfSeriesChange');
    ops.push({
      entity: 'transactions',
      id: row.id,
      expectedVersion: row.versionAfter,
      patch: { recurring_series_id: null, occurrence_date: null },
    });
  }

  assertValidVersion(cs.series.versionAfter, 'inverseOfSeriesChange');
  ops.push({
    entity: 'recurring_series',
    id: cs.series.id,
    expectedVersion: cs.series.versionAfter,
    patch: cs.series.before === null ? { deleted_at: NOW_SENTINEL } : cs.series.before,
  });

  return ops;
}

/**
 * The one inverse of an import (D-16, D-50, D-55): every inserted row is soft-deleted at
 * the version it holds after any linking patch, and `patchInverse` (planBulkPatch(...).
 * inverse for whatever linking/mark-paid/limit patches the import made) supplies the
 * reversal for every *stored* row it touched -- with any op the patch inverse also
 * carries for an *imported* row dropped, since that row's soft-delete alone reverses it
 * (RESEARCH.md §A5.3 pitfall 7).
 */
export function inverseOfImport(input: {
  inserted: readonly { id: string; version: number }[];
  patchInverse: readonly PatchOp[];
}): PatchOp[] {
  const insertedIds = new Set(input.inserted.map((row) => row.id));
  const ops: PatchOp[] = [
    ...inverseOfInserts('transactions', input.inserted),
    ...input.patchInverse.filter((op) => !insertedIds.has(op.id)),
  ];

  if (ops.length === 0) {
    throw new RangeError('inverseOfImport: nothing to reverse (no inserted rows and no patches)');
  }

  return ops;
}

/**
 * One user action is one step (D-24): a labelled, ordered list of ops, plus every id it
 * touches, unique and in first-seen order (so the History screen can name what a step
 * affects without re-deriving it from `ops`). `MAX_UNDO_OPS` mirrors the server-side size
 * check (T-02-05-03, plan 02-09) so an oversized step is rejected here, before it is ever
 * sent.
 */
export function buildStep(
  id: string,
  labelKey: UndoLabelKey,
  labelParams: UndoLabelParams,
  ops: readonly PatchOp[]
): UndoStepDraft {
  if (ops.length === 0) {
    throw new RangeError('buildStep: ops must not be empty');
  }
  if (ops.length > MAX_UNDO_OPS) {
    throw new RangeError(`buildStep: ops exceeds MAX_UNDO_OPS (${MAX_UNDO_OPS})`);
  }

  const seen = new Set<string>();
  const touchedIds: string[] = [];
  for (const op of ops) {
    if (!seen.has(op.id)) {
      seen.add(op.id);
      touchedIds.push(op.id);
    }
  }

  return { id, labelKey, labelParams, ops: [...ops], touchedIds };
}
