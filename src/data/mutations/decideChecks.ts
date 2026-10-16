// 05-19 (DCU-03, DCU-04, D-11, D-15): paused-mutation defaults and hooks for Decide checks.
//   createCheck    insert an open check (replay key: the client id; a duplicate id is success). No undo step.
//   saveCheckDraft autosave of an open check, last write wins. NEVER an undo step (A5).
//   editCheck      version-conditional patch shared by abandon, mark seen and remove (replay key: the step id
//                  for the undoable ones; a replayed edit that already landed is accepted).
// Only the inputs the user typed and the state/basis they last saw are stored; no verdict is ever written
// from here (D-15). Go ahead / Wait / Pass are server RPCs in 05-20. Failed-write records carry ids, kinds
// and field counts only, never the item name or any amount (privacy). Variables are plain JSON so a paused
// mutation survives a restart.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfPatches, type PatchOp, type PatchValue, type UndoLabelKey, type UndoLabelParams } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertDecideCheck,
  saveDecideCheckDraft,
  updateDecideCheck,
  type DecideCheckPatch,
  type DecideCheckRow,
  type SeenBasis,
  type SeenState,
} from '@/db/decideChecks';
import { updateSavingsGoal, type SavingsGoalRow } from '@/db/savingsGoals';
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

type CheckList = WithPending<DecideCheckRow>[];
type GoalList = SavingsGoalRow[];

export interface CheckCacheKey {
  userId: string;
  householdId: string;
}

export interface CreateCheckVars {
  userId: string;
  id: string;
  householdId: string;
  kind: 'buy' | 'invest';
  name: string;
  inputs: Record<string, unknown>;
  furthestStep: number;
  reopenedFrom?: string | null;
}

export interface SaveCheckDraftVars {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  furthestStep: number;
}

export interface EditCheckVars {
  id: string;
  ownerId: string;
  cache: CheckCacheKey;
  expectedVersion: number;
  patch: DecideCheckPatch;
  /** Part 2 (D-34): a Wait decision's goal goes in the same step, so Undo restores both. */
  goal?: { id: string; expectedVersion: number } | null;
  undo?: {
    stepId: string;
    labelKey: UndoLabelKey;
    labelParams: UndoLabelParams;
    before: Readonly<Record<string, PatchValue>>;
  };
}

function patchChecks(qc: QueryClient, cache: CheckCacheKey, updater: (rows: CheckList) => CheckList): void {
  qc.setQueryData<CheckList>(queryKeys.decideChecks(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

function dropGoal(qc: QueryClient, cache: CheckCacheKey, goalId: string): void {
  qc.setQueryData<GoalList>(queryKeys.savingsGoals(cache.userId, cache.householdId), (old) =>
    old ? old.filter((g) => g.id !== goalId) : old
  );
}

export function registerDecideCheckMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.createCheck, {
    mutationFn: (vars: CreateCheckVars) =>
      guardSession(vars, async () =>
        insertDecideCheck(await writeClient(), {
          id: vars.id,
          household_id: vars.householdId,
          kind: vars.kind,
          name: vars.name,
          inputs: vars.inputs,
          furthest_step: vars.furthestStep,
          ...(vars.reopenedFrom ? { reopened_from: vars.reopenedFrom } : {}),
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: CreateCheckVars) => {
      markSession(vars);
      const cache = { userId: vars.userId, householdId: vars.householdId };
      await qc.cancelQueries({ queryKey: queryKeys.decideChecks(cache.userId, cache.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<DecideCheckRow> = {
        id: vars.id,
        household_id: vars.householdId,
        created_by: vars.userId,
        kind: vars.kind,
        name: vars.name,
        inputs: vars.inputs,
        status: 'open',
        furthest_step: vars.furthestStep,
        last_seen_state: null,
        last_seen_basis: null,
        reopened_from: vars.reopenedFrom ?? null,
        decided_at: null,
        verdict_at_decision: null,
        estimate_day_one: null,
        estimate_monthly: null,
        wait_monthly: null,
        ready_by: null,
        broke_line: false,
        cooling_off_at: null,
        estimate_monthly_payment: null,
        estimate_running: null,
        is_sample: false,
        deleted_at: null,
        version: 1,
        updated_by: null,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchChecks(qc, cache, (rows) => upsertRow(rows, optimistic, 'start'));
    },
    onSuccess: (row: DecideCheckRow, vars: CreateCheckVars) => {
      patchChecks(qc, { userId: vars.userId, householdId: vars.householdId }, (rows) => upsertRow(rows, row, 'start'));
    },
    onError: async (err: unknown, vars: CreateCheckVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchChecks(qc, { userId: vars.userId, householdId: vars.householdId }, (rows) =>
        rows.filter((r) => r.id !== vars.id)
      );
      await recordFailedWrite({
        entity: 'decide_checks',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { kind: vars.kind, furthestStep: vars.furthestStep },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.saveCheckDraft, {
    mutationFn: (vars: SaveCheckDraftVars) =>
      guardSession(vars, async () =>
        saveDecideCheckDraft(await writeClient(), vars.id, {
          name: vars.name,
          inputs: vars.inputs,
          furthest_step: vars.furthestStep,
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: SaveCheckDraftVars) => {
      markSession(vars);
      // The only queries under this prefix are the per-user check lists, so the draft is patched wherever it lives.
      qc.setQueriesData<CheckList>({ queryKey: ['decide-checks'] }, (old) =>
        Array.isArray(old)
          ? old.map((r) =>
              r.id === vars.id
                ? { ...r, name: vars.name, inputs: vars.inputs, furthest_step: vars.furthestStep, pending: true }
                : r
            )
          : old
      );
    },
    onSuccess: (row: DecideCheckRow) => {
      qc.setQueriesData<CheckList>({ queryKey: ['decide-checks'] }, (old) =>
        Array.isArray(old) ? old.map((r) => (r.id === row.id ? row : r)) : old
      );
    },
    onError: async (err: unknown, vars: SaveCheckDraftVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      // A decided or deleted check cannot take a draft: refetch and park the failure, no toast.
      void qc.invalidateQueries({ queryKey: ['decide-checks'] });
      await recordFailedWrite({
        entity: 'decide_checks',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { furthestStep: vars.furthestStep },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editCheck, {
    mutationFn: (vars: EditCheckVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('decide_checks', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateDecideCheck(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DecideCheckRow>(err, vars.patch)
        );
        recordWrittenVersion('decide_checks', vars.id, [vars.expectedVersion, expected], row.version);

        let goalOps: PatchOp[] = [];
        if (vars.goal) {
          const goalExpected = resolveExpectedVersion('savings_goals', vars.goal.id, vars.goal.expectedVersion);
          const goalPatch = { deleted_at: vars.patch.deleted_at ?? null };
          const goal = await updateSavingsGoal(client, vars.goal.id, goalExpected, goalPatch).catch((err: unknown) =>
            acceptIfAlreadyApplied<SavingsGoalRow>(err, goalPatch)
          );
          recordWrittenVersion('savings_goals', vars.goal.id, [vars.goal.expectedVersion, goalExpected], goal.version);
          goalOps = inverseOfPatches('savings_goals', [
            { id: goal.id, before: { deleted_at: null }, versionAfter: goal.version },
          ]);
        }

        if (vars.undo) {
          const step = buildStep(vars.undo.stepId, vars.undo.labelKey, vars.undo.labelParams, [
            ...inverseOfPatches('decide_checks', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }]),
            ...goalOps,
          ]);
          await recordUndoStepSafely(qc, client, step, vars.ownerId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditCheckVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideChecks(vars.cache.userId, vars.cache.householdId) });
      patchChecks(qc, vars.cache, (rows) =>
        vars.patch.deleted_at
          ? rows.filter((r) => r.id !== vars.id)
          : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
      if (vars.goal && vars.patch.deleted_at) dropGoal(qc, vars.cache, vars.goal.id);
    },
    onSuccess: (row: DecideCheckRow, vars: EditCheckVars) => {
      patchChecks(qc, vars.cache, (rows) =>
        row.deleted_at ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))
      );
    },
    onError: async (err: unknown, vars: EditCheckVars) => {
      const cls = classifySettledWriteError(err);
      const attempted = { labelKey: vars.undo?.labelKey ?? 'seen', withGoal: Boolean(vars.goal) };
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DecideCheckRow;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          patchChecks(qc, vars.cache, (rows) => {
            if (serverRow.deleted_at) return rows.filter((r) => r.id !== vars.id);
            return rows.some((r) => r.id === vars.id)
              ? rows.map((r) => (r.id === vars.id ? serverRow : r))
              : [...rows, serverRow];
          });
        } else {
          void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.cache.userId, vars.cache.householdId) });
        }
        if (vars.goal) {
          void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
        }
        await recordFailedWrite({
          entity: 'decide_checks',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.cache.userId, vars.cache.householdId) });
        if (vars.goal) {
          void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
        }
        await recordFailedWrite({
          entity: 'decide_checks',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted,
        });
      }
    },
  });
}

export function useCreateCheck(): {
  create(input: {
    userId: string;
    id: string;
    householdId: string;
    kind: 'buy' | 'invest';
    name: string;
    inputs: Record<string, unknown>;
    furthestStep: number;
  }): void;
} {
  const mutation = useMutation<DecideCheckRow, unknown, CreateCheckVars>({
    mutationKey: mutationKeys.createCheck,
    scope: WRITE_SCOPE,
  });
  return {
    create(input) {
      mutation.mutate({ ...input });
    },
  };
}

export function useSaveCheckDraft(): {
  save(input: { id: string; name: string; inputs: Record<string, unknown>; furthestStep: number }): void;
} {
  const mutation = useMutation<DecideCheckRow, unknown, SaveCheckDraftVars>({
    mutationKey: mutationKeys.saveCheckDraft,
    scope: WRITE_SCOPE,
  });
  return {
    save(input) {
      mutation.mutate({ ...input });
    },
  };
}

function useEditCheckMutation() {
  return useMutation<DecideCheckRow, unknown, EditCheckVars>({
    mutationKey: mutationKeys.editCheck,
    scope: WRITE_SCOPE,
  });
}

function cacheOf(row: DecideCheckRow): CheckCacheKey {
  return { userId: row.created_by, householdId: row.household_id };
}

/** DCU-04 / A5: abandoning an open check is one undo step. Returns the step id for the toast's Undo. */
export function useAbandonCheck(): { abandon(row: DecideCheckRow): string } {
  const mutation = useEditCheckMutation();
  return {
    abandon(row) {
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: { stepId, labelKey: 'checkAbandoned', labelParams: { name: row.name }, before: { deleted_at: null } },
      });
      return stepId;
    },
  };
}

/** D-15: remembers what the user saw, only to say "Changed since you looked" later. No undo step. */
export function useMarkCheckSeen(): { markSeen(row: DecideCheckRow, state: SeenState, basis: SeenBasis): boolean } {
  const mutation = useEditCheckMutation();
  return {
    markSeen(row, state, basis) {
      if (row.last_seen_state === state && row.last_seen_basis === basis) return false;
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { last_seen_state: state, last_seen_basis: basis },
      });
      return true;
    },
  };
}

/**
 * D-11: removing a decision is an undoable soft delete. It never touches the lines the decision wrote.
 * Part 2 (D-34): a live goal of this check is soft-deleted in the same step.
 */
export function useRemoveDecision(): { remove(row: DecideCheckRow, goal?: SavingsGoalRow | null): string } {
  const mutation = useEditCheckMutation();
  return {
    remove(row, goal) {
      const stepId = newStepId();
      const liveGoal = goal && goal.check_id === row.id && goal.deleted_at === null ? goal : null;
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        goal: liveGoal ? { id: liveGoal.id, expectedVersion: liveGoal.version } : null,
        undo: { stepId, labelKey: 'decisionRemoved', labelParams: { name: row.name }, before: { deleted_at: null } },
      });
      return stepId;
    },
  };
}

function reopenedInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const wait = inputs.wait && typeof inputs.wait === 'object' && !Array.isArray(inputs.wait) ? inputs.wait : {};
  return { ...inputs, outcome: null, wait: { ...wait, monthlyAmount: null } };
}

/**
 * A waiting or passed decision reopens as a NEW open check from its inputs; the old decision and its goal stay.
 * `_today` is kept in the signature so callers pass the same context they use elsewhere; dates are not rewritten.
 */
export function useReopenCheck(): { reopen(row: DecideCheckRow, _today: string): string } {
  const mutation = useMutation<DecideCheckRow, unknown, CreateCheckVars>({
    mutationKey: mutationKeys.createCheck,
    scope: WRITE_SCOPE,
  });
  return {
    reopen(row) {
      const id = Crypto.randomUUID();
      mutation.mutate({
        userId: row.created_by,
        id,
        householdId: row.household_id,
        kind: row.kind,
        name: row.name,
        inputs: reopenedInputs(row.inputs),
        furthestStep: row.furthest_step,
        reopenedFrom: row.id,
      });
      return id;
    },
  };
}
