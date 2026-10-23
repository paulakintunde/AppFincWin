// 05-40 (DCU-03, DCU-15, D-27): paused-mutation defaults and hooks for "Changes coming up".
// Add, edit and remove each go through the persisted write queue and record one undo step
// (changeAdded / changeEdited / changeRemoved on entity decide_changes). Removal is a soft
// delete so Undo can bring the row back. Every success invalidates the changes key so the
// Decide snapshot recomputes in the same render (D-15). Variables are plain JSON; failed-write
// records carry ids and counts only, never a name or an amount (privacy).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue, type UndoLabelParams } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertDecideChange,
  updateDecideChange,
  type DecideChangePatch,
  type DecideChangeRow,
  type NewDecideChange,
} from '@/db/decideChanges';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type ChangeList = WithPending<DecideChangeRow>[];

export interface ChangeCacheKey {
  userId: string;
  householdId: string;
}

export interface AddChangeVars {
  ownerId: string;
  cache: ChangeCacheKey;
  row: NewDecideChange;
  stepId: string;
}

export interface EditChangeVars {
  id: string;
  ownerId: string;
  cache: ChangeCacheKey;
  expectedVersion: number;
  patch: DecideChangePatch;
  undo: {
    stepId: string;
    labelKey: 'changeEdited' | 'changeRemoved' | 'changeDeleted';
    labelParams: UndoLabelParams;
    before: Readonly<Record<string, PatchValue>>;
  };
}

function patchChanges(qc: QueryClient, cache: ChangeCacheKey, updater: (rows: ChangeList) => ChangeList): void {
  qc.setQueryData<ChangeList>(queryKeys.decideChanges(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

function invalidateChanges(qc: QueryClient, cache: ChangeCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.decideChanges(cache.userId, cache.householdId) });
}

function labelParams(name: string | null): UndoLabelParams {
  return name ? { name } : {};
}

export function registerDecideChangeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addChange, {
    mutationFn: (vars: AddChangeVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertDecideChange(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'changeAdded',
          labelParams(vars.row.name),
          inverseOfInserts('decide_changes', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddChangeVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideChanges(vars.cache.userId, vars.cache.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<DecideChangeRow> = {
        ...vars.row,
        created_by: vars.ownerId,
        updated_by: null,
        is_sample: false,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchChanges(qc, vars.cache, (rows) => upsertRow(rows, optimistic, 'end'));
    },
    onSuccess: (row: DecideChangeRow, vars: AddChangeVars) => {
      patchChanges(qc, vars.cache, (rows) => upsertRow(rows, row, 'end'));
      invalidateChanges(qc, vars.cache);
    },
    onError: async (err: unknown, vars: AddChangeVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchChanges(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'decide_changes',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { changeId: vars.row.id },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editChange, {
    mutationFn: (vars: EditChangeVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('decide_changes', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateDecideChange(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DecideChangeRow>(err, vars.patch)
        );
        recordWrittenVersion('decide_changes', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.undo.stepId,
          vars.undo.labelKey,
          vars.undo.labelParams,
          inverseOfPatches('decide_changes', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditChangeVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideChanges(vars.cache.userId, vars.cache.householdId) });
      patchChanges(qc, vars.cache, (rows) =>
        vars.patch.deleted_at
          ? rows.filter((r) => r.id !== vars.id)
          : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: DecideChangeRow, vars: EditChangeVars) => {
      patchChanges(qc, vars.cache, (rows) =>
        row.deleted_at ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))
      );
      invalidateChanges(qc, vars.cache);
    },
    onError: async (err: unknown, vars: EditChangeVars) => {
      const cls = classifySettledWriteError(err);
      const attempted = { labelKey: vars.undo.labelKey, fields: Object.keys(vars.patch).length };
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DecideChangeRow;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          patchChanges(qc, vars.cache, (rows) => {
            if (serverRow.deleted_at) return rows.filter((r) => r.id !== vars.id);
            return rows.some((r) => r.id === vars.id)
              ? rows.map((r) => (r.id === vars.id ? serverRow : r))
              : [...rows, serverRow];
          });
        } else {
          invalidateChanges(qc, vars.cache);
        }
        await recordFailedWrite({
          entity: 'decide_changes',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        invalidateChanges(qc, vars.cache);
        await recordFailedWrite({
          entity: 'decide_changes',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted,
        });
      }
    },
  });
}

export function useAddChange(): {
  add(input: { householdId: string; ownerId: string; change: Omit<NewDecideChange, 'id' | 'household_id'> }): {
    id: string;
    stepId: string;
  };
} {
  const mutation = useMutation<DecideChangeRow, unknown, AddChangeVars>({
    mutationKey: mutationKeys.addChange,
    scope: WRITE_SCOPE,
  });
  return {
    add(input) {
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: input.householdId },
        row: { ...input.change, id, household_id: input.householdId },
        stepId,
      });
      return { id, stepId };
    },
  };
}

function useEditChangeMutation() {
  return useMutation<DecideChangeRow, unknown, EditChangeVars>({
    mutationKey: mutationKeys.editChange,
    scope: WRITE_SCOPE,
  });
}

function cacheOf(row: DecideChangeRow): ChangeCacheKey {
  return { userId: row.created_by, householdId: row.household_id };
}

export function useEditChange(): { edit(row: DecideChangeRow, patch: DecideChangePatch): string } {
  const mutation = useEditChangeMutation();
  return {
    edit(row, patch) {
      const keys = Object.keys(patch) as (keyof DecideChangePatch)[];
      if (keys.length === 0) throw new RangeError('edit change: nothing to change');
      const before: Record<string, PatchValue> = {};
      for (const key of keys) before[key] = row[key];
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch,
        undo: { stepId, labelKey: 'changeEdited', labelParams: labelParams(patch.name ?? row.name), before },
      });
      return stepId;
    },
  };
}

/** Returns the step id; the caller toasts "Change removed" with Undo. */
export function useRemoveChange(): { remove(row: DecideChangeRow): string } {
  const mutation = useEditChangeMutation();
  return {
    remove(row) {
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: { stepId, labelKey: 'changeDeleted', labelParams: labelParams(row.name), before: { deleted_at: null } },
      });
      return stepId;
    },
  };
}
