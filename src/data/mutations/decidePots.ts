// 05-122 (D-101, R18.2): paused-mutation defaults and hooks for pots (savings_goals, kind 'pot').
// Add, edit, delete (soft), mark done and reopen each go through the persisted write queue and record
// one undo step (potAdded / potEdited / potDeleted / potDone / potReopened on entity savings_goals).
// Edits are version-conditional with the undo step id as the replay key (recordUndoStepSafely dedups on it,
// and a landed replay is accepted). A Wait goal (kind 'wait') belongs to its check: only done_at may change here,
// the guard from 05-119 would put anything else back. Variables are plain JSON; failed-write records carry ids
// and counts only, never a name or an amount (privacy).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue, type UndoLabelParams } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertSavingsGoal,
  updateSavingsGoal,
  type NewPot,
  type SavingsGoalPatch,
  type SavingsGoalRow,
} from '@/db/savingsGoals';
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

type PotList = WithPending<SavingsGoalRow>[];

export interface PotCacheKey {
  userId: string;
  householdId: string;
}

export type PotUndoLabel = 'potEdited' | 'potDeleted' | 'potDone' | 'potReopened';

export interface AddPotVars {
  ownerId: string;
  cache: PotCacheKey;
  row: NewPot;
  stepId: string;
}

export interface EditPotVars {
  id: string;
  ownerId: string;
  cache: PotCacheKey;
  expectedVersion: number;
  patch: SavingsGoalPatch;
  undo: {
    stepId: string;
    labelKey: PotUndoLabel;
    labelParams: UndoLabelParams;
    before: Readonly<Record<string, PatchValue>>;
  };
}

function patchPots(qc: QueryClient, cache: PotCacheKey, updater: (rows: PotList) => PotList): void {
  qc.setQueryData<PotList>(queryKeys.savingsGoals(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

function invalidatePots(qc: QueryClient, cache: PotCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(cache.userId, cache.householdId) });
}

function labelParams(name: string | null): UndoLabelParams {
  return name ? { name } : {};
}

export function registerDecidePotMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addPot, {
    mutationFn: (vars: AddPotVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // A duplicate client id (23505) is read back by insertSavingsGoal: this exact write already landed.
        const row = await insertSavingsGoal(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'potAdded',
          labelParams(vars.row.name),
          inverseOfInserts('savings_goals', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddPotVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<SavingsGoalRow> = {
        ...vars.row,
        created_by: vars.ownerId,
        check_id: null,
        monthly_amount: vars.row.monthly_amount ?? null,
        done_at: null,
        is_sample: false,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchPots(qc, vars.cache, (rows) => upsertRow(rows, optimistic, 'end'));
    },
    onSuccess: (row: SavingsGoalRow, vars: AddPotVars) => {
      patchPots(qc, vars.cache, (rows) => upsertRow(rows, row, 'end'));
      invalidatePots(qc, vars.cache);
    },
    onError: async (err: unknown, vars: AddPotVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchPots(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'savings_goals',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { potId: vars.row.id },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editPot, {
    mutationFn: (vars: EditPotVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('savings_goals', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateSavingsGoal(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<SavingsGoalRow>(err, vars.patch)
        );
        recordWrittenVersion('savings_goals', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.undo.stepId,
          vars.undo.labelKey,
          vars.undo.labelParams,
          inverseOfPatches('savings_goals', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditPotVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      patchPots(qc, vars.cache, (rows) =>
        vars.patch.deleted_at
          ? rows.filter((r) => r.id !== vars.id)
          : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: SavingsGoalRow, vars: EditPotVars) => {
      patchPots(qc, vars.cache, (rows) =>
        row.deleted_at ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))
      );
      invalidatePots(qc, vars.cache);
    },
    onError: async (err: unknown, vars: EditPotVars) => {
      const cls = classifySettledWriteError(err);
      const attempted = { labelKey: vars.undo.labelKey, fields: Object.keys(vars.patch).length };
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as SavingsGoalRow;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          patchPots(qc, vars.cache, (rows) => {
            if (serverRow.deleted_at) return rows.filter((r) => r.id !== vars.id);
            return rows.some((r) => r.id === vars.id)
              ? rows.map((r) => (r.id === vars.id ? serverRow : r))
              : [...rows, serverRow];
          });
        } else {
          invalidatePots(qc, vars.cache);
        }
        await recordFailedWrite({
          entity: 'savings_goals',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        invalidatePots(qc, vars.cache);
        await recordFailedWrite({
          entity: 'savings_goals',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted,
        });
      }
    },
  });
}

interface NewPotInputBase {
  name: string;
  currency: string;
  opening_saved: number;
  account_id?: string | null;
  color_key?: SavingsGoalRow['color_key'];
}
/** 05.2 D-22: a bucket needs no date and may have no goal; an ordinary pot keeps its target and ready-by date. */
export type NewPotInput =
  | (NewPotInputBase & { target: number; ready_by: string; bucket?: undefined; monthly_amount?: undefined })
  | (NewPotInputBase & {
      bucket: NonNullable<SavingsGoalRow['bucket']>;
      target: number | null;
      ready_by: null;
      monthly_amount: number;
    });

/** Add a pot. Returns the client-generated id and the undo step id; the caller toasts "Pot added" with Undo. */
export function useAddPot(): {
  add(input: { householdId: string; ownerId: string; pot: NewPotInput }): { id: string; stepId: string };
} {
  const mutation = useMutation<SavingsGoalRow, unknown, AddPotVars>({
    mutationKey: mutationKeys.addPot,
    scope: WRITE_SCOPE,
  });
  return {
    add(input) {
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: input.householdId },
        row: { ...input.pot, id, household_id: input.householdId, kind: 'pot' },
        stepId,
      });
      return { id, stepId };
    },
  };
}

function useEditPotMutation() {
  return useMutation<SavingsGoalRow, unknown, EditPotVars>({
    mutationKey: mutationKeys.editPot,
    scope: WRITE_SCOPE,
  });
}

function cacheOf(row: SavingsGoalRow): PotCacheKey {
  return { userId: row.created_by, householdId: row.household_id };
}

function beforeOf(row: SavingsGoalRow, keys: readonly (keyof SavingsGoalPatch)[]): Record<string, PatchValue> {
  const before: Record<string, PatchValue> = {};
  for (const key of keys) before[key] = row[key] ?? null;
  return before;
}

/** Edit name, target, date, opening amount, Held in account, colour or (buckets only) monthly amount. Returns the undo step id. */
export function useEditPot(): { edit(row: SavingsGoalRow, patch: SavingsGoalPatch): string } {
  const mutation = useEditPotMutation();
  return {
    edit(row, patch) {
      const keys = Object.keys(patch) as (keyof SavingsGoalPatch)[];
      if (keys.length === 0) throw new RangeError('edit pot: nothing to change');
      if (keys.includes('deleted_at') || keys.includes('done_at')) {
        throw new RangeError('edit pot: use delete, done or reopen for those');
      }
      if (row.kind === 'wait') throw new RangeError('edit pot: a Wait goal is edited through its check');
      if (keys.includes('monthly_amount') && !row.bucket) {
        throw new RangeError('edit pot: monthly amount belongs to a saving bucket');
      }
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch,
        undo: { stepId, labelKey: 'potEdited', labelParams: labelParams(patch.name ?? row.name), before: beforeOf(row, keys) },
      });
      return stepId;
    },
  };
}

/** Soft delete a plain pot. Returns the step id; the caller toasts "Pot deleted" with Undo. */
export function useDeletePot(): { remove(row: SavingsGoalRow): string } {
  const mutation = useEditPotMutation();
  return {
    remove(row) {
      if (row.kind === 'wait') throw new RangeError('delete pot: a Wait goal is removed with its decision');
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: { stepId, labelKey: 'potDeleted', labelParams: labelParams(row.name), before: { deleted_at: null } },
      });
      return stepId;
    },
  };
}

/** Mark a pot done (done = true) or reopen it. Allowed for both kinds. Returns the undo step id. */
export function useSetPotDone(): { setDone(row: SavingsGoalRow, done: boolean): string } {
  const mutation = useEditPotMutation();
  return {
    setDone(row, done) {
      const patch: SavingsGoalPatch = { done_at: done ? new Date().toISOString() : null };
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch,
        undo: {
          stepId,
          labelKey: done ? 'potDone' : 'potReopened',
          labelParams: labelParams(row.name),
          before: { done_at: row.done_at },
        },
      });
      return stepId;
    },
  };
}
