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
import { useSyncExternalStore } from 'react';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  buildStep,
  inverseOfPatches,
  planBulkPatch,
  type PatchValue,
  type UndoLabelKey,
  type UndoLabelParams,
} from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import {
  insertDecideCheck,
  kindFollowingInputs,
  saveDecideCheckDraft,
  updateDecideCheck,
  type DecideCheckPatch,
  type DecideCheckRow,
  type SeenBasis,
  type SeenState,
} from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { dismissFailedWrite, recordFailedWrite, type FailedWrite } from '@/data/sync/failedWrites';
import { coalesceDraftSave } from '@/data/sync/coalesceDrafts';
import { showToast } from '@/state/undoToast';
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

/** A Wait decision removed together with its goal (WR-A04): apply_patches returns versions, not the row. */
interface RemovedWithGoal {
  id: string;
  deleted_at: string | null;
  version: number;
  removedWithGoal: true;
}

type EditCheckResult = DecideCheckRow | RemovedWithGoal;

/** D-88: replaces one row by id. Returns the same list when no row matches or the row comes back unchanged. */
function replaceRow(old: CheckList | undefined, id: string, next: (r: CheckList[number]) => CheckList[number]): CheckList | undefined {
  if (!Array.isArray(old)) return old;
  const i = old.findIndex((r) => r.id === id);
  if (i < 0) return old;
  const replaced = next(old[i]!);
  if (replaced === old[i]) return old;
  const out = old.slice();
  out[i] = replaced;
  return out;
}

function patchChecks(qc: QueryClient, cache: CheckCacheKey, updater: (rows: CheckList) => CheckList): void {
  qc.setQueryData<CheckList>(queryKeys.decideChecks(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

/**
 * D-73: true while a delete of this check is queued or in flight. A write that lands first (the create, an autosave) must not
 * put the row back from its server copy: the optimistic delete stands until the delete itself settles.
 */
function hasPendingDelete(qc: QueryClient, id: string): boolean {
  return qc
    .getMutationCache()
    .findAll({ mutationKey: mutationKeys.editCheck, status: 'pending' })
    .some((m) => {
      const vars = m.state.variables as EditCheckVars | undefined;
      return vars?.id === id && Boolean(vars.patch.deleted_at);
    });
}

function dropGoal(qc: QueryClient, cache: CheckCacheKey, goalId: string): void {
  qc.setQueryData<GoalList>(queryKeys.savingsGoals(cache.userId, cache.householdId), (old) =>
    old ? old.filter((g) => g.id !== goalId) : old
  );
}

// IN-B05: a reopen that finds the decision already reopened (decide_checks_reopened_once, another device first) lands on
// that check instead. The id it tried maps to the live one, so a screen opened on the tried id can move there.
const reopenRedirects = new Map<string, string>();
const redirectListeners = new Set<() => void>();
function redirectReopen(triedId: string, liveId: string): void {
  reopenRedirects.set(triedId, liveId);
  for (const listener of redirectListeners) listener();
}
function subscribeRedirects(listener: () => void): () => void {
  redirectListeners.add(listener);
  return () => {
    redirectListeners.delete(listener);
  };
}
/** IN-B05: the live check a reopen of `id` resolved to, when it found the decision already reopened; otherwise null. */
export function useReopenRedirect(id: string): string | null {
  return useSyncExternalStore(subscribeRedirects, () => reopenRedirects.get(id) ?? null);
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
        kind: kindFollowingInputs(vars.kind, vars.inputs),
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
      const cache = { userId: vars.userId, householdId: vars.householdId };
      if (row.id !== vars.id) {
        // IN-B05: the decision was already reopened; the optimistic copy goes and the live one is opened instead.
        patchChecks(qc, cache, (rows) => upsertRow(rows.filter((r) => r.id !== vars.id), row, 'start'));
        redirectReopen(vars.id, row.id);
        return;
      }
      if (hasPendingDelete(qc, vars.id)) return;
      patchChecks(qc, cache, (rows) => upsertRow(rows, row, 'start'));
    },
    onError: async (err: unknown, vars: CreateCheckVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchChecks(qc, { userId: vars.userId, householdId: vars.householdId }, (rows) =>
        rows.filter((r) => r.id !== vars.id)
      );
      // The draft is kept on this device (encrypted with the rest of the parked writes): "Try again" in the failed-saves
      // list re-creates it from here. The toast says so at the time, so a refused first save is never silent.
      await recordFailedWrite({
        entity: 'decide_checks',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: {
          op: 'create',
          name: vars.name,
          kind: vars.kind,
          furthestStep: vars.furthestStep,
          inputs: vars.inputs,
          householdId: vars.householdId,
          userId: vars.userId,
          ...(vars.reopenedFrom ? { reopenedFrom: vars.reopenedFrom } : {}),
        },
      });
      showToast({ kind: 'refusal', tone: 'warning', text: { key: 'sync.checkNotSaved' } });
    },
  });

  qc.setMutationDefaults(mutationKeys.saveCheckDraft, {
    mutationFn: (vars: SaveCheckDraftVars) =>
      guardSession(vars, async () => {
        const row = await saveDecideCheckDraft(await writeClient(), vars.id, {
          name: vars.name,
          inputs: vars.inputs,
          furthest_step: vars.furthestStep,
        });
        // D-77: the check was soft-deleted; the stale save is skipped without a trace.
        if (row === null) return null;
        // WR-A03: the save is unconditional but bump_version still raises the version by exactly one. Record that in
        // the chain, so a queued abandon / mark-seen / remove built on the cached version resolves past this save
        // instead of reporting a false conflict.
        recordWrittenVersion('decide_checks', vars.id, [row.version - 1], row.version);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: SaveCheckDraftVars) => {
      markSession(vars);
      // The only queries under this prefix are the per-user check lists, so the draft is patched wherever it lives.
      // D-88: structural sharing. Only the matching row is replaced; every other row, and the list when nothing matches,
      // keeps its identity.
      qc.setQueriesData<CheckList>({ queryKey: ['decide-checks'] }, (old) =>
        replaceRow(old, vars.id, (r) =>
          r.name === vars.name && r.inputs === vars.inputs && r.furthest_step === vars.furthestStep && r.pending === true
            ? r
            : { ...r, name: vars.name, inputs: vars.inputs, furthest_step: vars.furthestStep, pending: true }
        )
      );
    },
    onSuccess: (row: DecideCheckRow | null) => {
      if (row === null) return;
      qc.setQueriesData<CheckList>({ queryKey: ['decide-checks'] }, (old) => replaceRow(old, row.id, () => row));
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
    mutationFn: (vars: EditCheckVars): Promise<EditCheckResult> =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('decide_checks', vars.id, vars.expectedVersion);
        const client = await writeClient();

        // WR-A04: a Wait decision and its goal are soft-deleted in ONE apply_patches call that also records the undo
        // step, so they land or fail together (a goal conflict no longer leaves the check deleted with no Undo).
        if (vars.goal) {
          const goalExpected = resolveExpectedVersion('savings_goals', vars.goal.id, vars.goal.expectedVersion);
          const deletedAt = vars.patch.deleted_at ?? null;
          const { forward, inverse } = planBulkPatch([
            {
              entity: 'decide_checks',
              id: vars.id,
              expectedVersion: expected,
              before: vars.undo?.before ?? { deleted_at: null },
              patch: vars.patch as Readonly<Record<string, PatchValue>>,
            },
            {
              entity: 'savings_goals',
              id: vars.goal.id,
              expectedVersion: goalExpected,
              before: { deleted_at: null },
              patch: { deleted_at: deletedAt },
            },
          ]);
          const step = vars.undo ? buildStep(vars.undo.stepId, vars.undo.labelKey, vars.undo.labelParams, inverse) : null;
          const applied = await applyPatches(client, forward, step);
          const checkVersion = applied.find((r) => r.entity === 'decide_checks' && r.id === vars.id)?.version ?? expected + 1;
          const goalVersion =
            applied.find((r) => r.entity === 'savings_goals' && r.id === vars.goal!.id)?.version ?? goalExpected + 1;
          recordWrittenVersion('decide_checks', vars.id, [vars.expectedVersion, expected], checkVersion);
          recordWrittenVersion('savings_goals', vars.goal.id, [vars.goal.expectedVersion, goalExpected], goalVersion);
          void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
          return { id: vars.id, deleted_at: deletedAt, version: checkVersion, removedWithGoal: true };
        }

        const row = await updateDecideCheck(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DecideCheckRow>(err, vars.patch)
        );
        recordWrittenVersion('decide_checks', vars.id, [vars.expectedVersion, expected], row.version);

        if (vars.undo) {
          const step = buildStep(
            vars.undo.stepId,
            vars.undo.labelKey,
            vars.undo.labelParams,
            inverseOfPatches('decide_checks', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
          );
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
    onSuccess: (row: EditCheckResult, vars: EditCheckVars) => {
      if (row.deleted_at || 'removedWithGoal' in row) {
        patchChecks(qc, vars.cache, (rows) => rows.filter((r) => r.id !== row.id));
        return;
      }
      patchChecks(qc, vars.cache, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: EditCheckVars) => {
      const cls = classifySettledWriteError(err);
      const attempted = { labelKey: vars.undo?.labelKey ?? 'seen', withGoal: Boolean(vars.goal) };
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DecideCheckRow;
        // A full check row (updateDecideCheck's conflict); apply_patches' conflict (WR-A04) names only an entity and id.
        if (serverRow && typeof serverRow === 'object' && 'household_id' in serverRow) {
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
  /** Ids of checks whose create is queued or in flight (from any screen). A check in this list is on its way, not missing. */
  pendingIds: readonly string[];
} {
  const mutation = useMutation<DecideCheckRow, unknown, CreateCheckVars>({
    mutationKey: mutationKeys.createCheck,
    scope: WRITE_SCOPE,
  });
  const pendingIds = useMutationState({
    filters: { mutationKey: mutationKeys.createCheck, status: 'pending' },
    select: (m) => (m.state.variables as CreateCheckVars | undefined)?.id ?? '',
  });
  return {
    create(input) {
      mutation.mutate({ ...input });
    },
    pendingIds,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The create a parked decide_checks failure can be retried with, or null when it holds no recoverable draft. */
export function recoverableCheckCreate(entry: Pick<FailedWrite, 'entity' | 'entityId' | 'attempted'>): CreateCheckVars | null {
  if (entry.entity !== 'decide_checks') return null;
  const a = entry.attempted;
  const inputs = asRecord(a.inputs);
  if (a.op !== 'create' || inputs === null) return null;
  if (typeof a.userId !== 'string' || typeof a.householdId !== 'string' || typeof a.name !== 'string') return null;
  const kind = a.kind === 'invest' ? 'invest' : 'buy';
  const furthestStep = typeof a.furthestStep === 'number' ? a.furthestStep : 1;
  return {
    userId: a.userId,
    id: entry.entityId,
    householdId: a.householdId,
    kind,
    name: a.name,
    inputs,
    furthestStep,
    ...(typeof a.reopenedFrom === 'string' ? { reopenedFrom: a.reopenedFrom } : {}),
  };
}

/** Re-creates a check whose first save was refused, from the draft its parked failure kept; then clears that failure. */
export function useRetryCheckCreate(): { retry(entry: FailedWrite): boolean } {
  const { create } = useCreateCheck();
  return {
    retry(entry) {
      const vars = recoverableCheckCreate(entry);
      if (vars === null) return false;
      create(vars);
      void dismissFailedWrite(entry.id);
      return true;
    },
  };
}

export function useSaveCheckDraft(): {
  save(input: { id: string; name: string; inputs: Record<string, unknown>; furthestStep: number }): void;
} {
  const qc = useQueryClient();
  const mutation = useMutation<DecideCheckRow | null, unknown, SaveCheckDraftVars>({
    mutationKey: mutationKeys.saveCheckDraft,
    scope: WRITE_SCOPE,
  });
  return {
    save(input) {
      // D-88: only the latest draft of a check travels; an older one still waiting is dropped first.
      coalesceDraftSave(qc, input.id);
      mutation.mutate({ ...input });
    },
  };
}

function useEditCheckMutation() {
  return useMutation<EditCheckResult, unknown, EditCheckVars>({
    mutationKey: mutationKeys.editCheck,
    scope: WRITE_SCOPE,
  });
}

function cacheOf(row: DecideCheckRow): CheckCacheKey {
  return { userId: row.created_by, householdId: row.household_id };
}

/** DCU-04 / A5: abandoning an open check is one undo step. Returns the step id for the toast's Undo. */
export function useAbandonCheck(): { abandon(row: DecideCheckRow, reason?: 'cleared' | 'deleted'): string } {
  const mutation = useEditCheckMutation();
  return {
    abandon(row, reason = 'deleted') {
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.created_by,
        cache: cacheOf(row),
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: {
          stepId,
          labelKey: reason === 'cleared' ? 'checkCleared' : 'checkDeleted',
          labelParams: { name: row.name },
          before: { deleted_at: null },
        },
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
        undo: { stepId, labelKey: 'decisionDeleted', labelParams: { name: row.name }, before: { deleted_at: null } },
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
