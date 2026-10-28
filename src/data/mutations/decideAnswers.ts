// 05.2-17 (D-13, DSU-19, DSU-21): paused-mutation defaults and hooks for the in-check answers on decide_answers.
// Save inserts when no live row exists for (kind, key), otherwise version-conditionally updates it; an unchanged
// answer writes nothing (05.1 D-59). Remove is a soft delete. Each write records one undo step (answerSaved /
// answerRemoved on entity decide_answers). Variables are plain JSON; failed-write records carry ids and counts only,
// never an amount. 05.2 builds saving only: the question screens are 05.3.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertDecideAnswer,
  updateDecideAnswer,
  type DecideAnswerPatch,
  type DecideAnswerRow,
  type NewDecideAnswer,
} from '@/db/decideAnswers';
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
import { checkAnswerKey, expectedIncomeKey, payArrivalKey } from './decideAnswerKeys';

type AnswerList = WithPending<DecideAnswerRow>[];

export interface AnswerCacheKey {
  userId: string;
  householdId: string;
}

export type AnswerInput =
  | { kind: 'pay_arrival'; seriesId: string; payDate: string; arrived: boolean }
  | { kind: 'expected_income'; month: string; amount: number; at: string }
  | { kind: 'held_bridge'; checkId: string; amount: number }
  | { kind: 'volatile_cover'; checkId: string; covers: boolean };

export interface InsertAnswerVars {
  mode: 'insert';
  ownerId: string;
  cache: AnswerCacheKey;
  row: NewDecideAnswer;
  stepId: string;
}

export interface UpdateAnswerVars {
  mode: 'update';
  id: string;
  ownerId: string;
  cache: AnswerCacheKey;
  expectedVersion: number;
  patch: DecideAnswerPatch;
  undo: { stepId: string; before: Readonly<Record<string, PatchValue>> };
}

export type SaveAnswerVars = InsertAnswerVars | UpdateAnswerVars;

export interface RemoveAnswerVars {
  id: string;
  ownerId: string;
  cache: AnswerCacheKey;
  expectedVersion: number;
  patch: DecideAnswerPatch;
  undo: { stepId: string; before: Readonly<Record<string, PatchValue>> };
}

type EditVars = UpdateAnswerVars | RemoveAnswerVars;
type EditLabel = 'answerSaved' | 'answerRemoved';

function patchAnswers(qc: QueryClient, cache: AnswerCacheKey, updater: (rows: AnswerList) => AnswerList): void {
  qc.setQueryData<AnswerList>(queryKeys.decideAnswers(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

function invalidateAnswers(qc: QueryClient, cache: AnswerCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.decideAnswers(cache.userId, cache.householdId) });
}

/** Shared by update and remove: the version-conditional patch and its undo step. */
async function runEdit(qc: QueryClient, vars: EditVars, labelKey: EditLabel): Promise<DecideAnswerRow> {
  const expected = resolveExpectedVersion('decide_answers', vars.id, vars.expectedVersion);
  const client = await writeClient();
  const row = await updateDecideAnswer(client, vars.id, expected, vars.patch).catch((err: unknown) =>
    acceptIfAlreadyApplied<DecideAnswerRow>(err, vars.patch)
  );
  recordWrittenVersion('decide_answers', vars.id, [vars.expectedVersion, expected], row.version);
  const step = buildStep(
    vars.undo.stepId,
    labelKey,
    {},
    inverseOfPatches('decide_answers', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
  );
  await recordUndoStepSafely(qc, client, step, vars.ownerId);
  return row;
}

function applyEditOptimistic(qc: QueryClient, vars: EditVars): void {
  patchAnswers(qc, vars.cache, (rows) =>
    vars.patch.deleted_at
      ? rows.filter((r) => r.id !== vars.id)
      : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
  );
}

function applyEditSuccess(qc: QueryClient, row: DecideAnswerRow, vars: EditVars): void {
  patchAnswers(qc, vars.cache, (rows) =>
    row.deleted_at ? rows.filter((r) => r.id !== row.id) : upsertRow(rows, row, 'end')
  );
  invalidateAnswers(qc, vars.cache);
}

async function handleEditError(qc: QueryClient, err: unknown, vars: EditVars, labelKey: EditLabel): Promise<void> {
  const cls = classifySettledWriteError(err);
  const attempted = { labelKey, fields: Object.keys(vars.patch).length };
  if (cls === 'conflict' && err instanceof VersionConflictError) {
    const serverRow = err.serverRow as DecideAnswerRow;
    if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
      patchAnswers(qc, vars.cache, (rows) =>
        serverRow.deleted_at ? rows.filter((r) => r.id !== vars.id) : upsertRow(rows, serverRow, 'end')
      );
    } else {
      invalidateAnswers(qc, vars.cache);
    }
    await recordFailedWrite({
      entity: 'decide_answers',
      entityId: vars.id,
      kind: 'conflict',
      code: 'version-conflict',
      attempted,
    });
    return;
  }
  if (cls === 'rejected' || cls === 'not-found') {
    invalidateAnswers(qc, vars.cache);
    await recordFailedWrite({
      entity: 'decide_answers',
      entityId: vars.id,
      kind: cls,
      code: settledWriteErrorCode(err),
      attempted,
    });
  }
}

export function registerDecideAnswerMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveDecideAnswer, {
    mutationFn: (vars: SaveAnswerVars) =>
      guardSession(vars, async () => {
        if (vars.mode === 'update') return runEdit(qc, vars, 'answerSaved');
        const client = await writeClient();
        // A duplicate client id (23505) is read back by insertDecideAnswer: this exact write already landed.
        const row = await insertDecideAnswer(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'answerSaved',
          {},
          inverseOfInserts('decide_answers', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveAnswerVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideAnswers(vars.cache.userId, vars.cache.householdId) });
      if (vars.mode === 'update') {
        applyEditOptimistic(qc, vars);
        return;
      }
      const now = new Date().toISOString();
      const optimistic: WithPending<DecideAnswerRow> = {
        ...vars.row,
        created_by: vars.ownerId,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchAnswers(qc, vars.cache, (rows) => upsertRow(rows, optimistic, 'end'));
    },
    onSuccess: (row: DecideAnswerRow, vars: SaveAnswerVars) => {
      if (vars.mode === 'update') {
        applyEditSuccess(qc, row, vars);
        return;
      }
      patchAnswers(qc, vars.cache, (rows) => upsertRow(rows, row, 'end'));
      invalidateAnswers(qc, vars.cache);
    },
    onError: async (err: unknown, vars: SaveAnswerVars) => {
      if (vars.mode === 'update') {
        await handleEditError(qc, err, vars, 'answerSaved');
        return;
      }
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchAnswers(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'decide_answers',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { answerId: vars.row.id },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.removeDecideAnswer, {
    mutationFn: (vars: RemoveAnswerVars) => guardSession(vars, () => runEdit(qc, vars, 'answerRemoved')),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RemoveAnswerVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideAnswers(vars.cache.userId, vars.cache.householdId) });
      applyEditOptimistic(qc, vars);
    },
    onSuccess: (row: DecideAnswerRow, vars: RemoveAnswerVars) => applyEditSuccess(qc, row, vars),
    onError: (err: unknown, vars: RemoveAnswerVars) => handleEditError(qc, err, vars, 'answerRemoved'),
  });
}

interface Shape {
  kind: DecideAnswerRow['kind'];
  key: string;
  amount: number | null;
  bool_value: boolean | null;
  on_date: string | null;
  check_id: string | null;
}

function requireAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('save answer: amount must be a whole number of minor units, 0 or more');
  }
  return amount;
}

function shapeOf(a: AnswerInput): Shape {
  switch (a.kind) {
    case 'pay_arrival':
      return { kind: a.kind, key: payArrivalKey(a.seriesId, a.payDate), amount: null, bool_value: a.arrived, on_date: a.payDate, check_id: null };
    case 'expected_income':
      return { kind: a.kind, key: expectedIncomeKey(a.month), amount: requireAmount(a.amount), bool_value: null, on_date: a.at, check_id: null };
    case 'held_bridge':
      return { kind: a.kind, key: checkAnswerKey(a.checkId), amount: requireAmount(a.amount), bool_value: null, on_date: null, check_id: a.checkId };
    case 'volatile_cover':
      return { kind: a.kind, key: checkAnswerKey(a.checkId), amount: null, bool_value: a.covers, on_date: null, check_id: a.checkId };
  }
}

const VALUE_FIELDS = ['amount', 'bool_value', 'on_date'] as const;

/**
 * Save one in-check answer. Returns the row id and undo step id, or null when the live row already holds this
 * answer (nothing is written). The caller toasts "Answer saved" with Undo.
 */
export function useSaveDecideAnswer(
  userId: string,
  householdId: string
): { save(a: AnswerInput): { id: string; stepId: string } | null } {
  const qc = useQueryClient();
  const mutation = useMutation<DecideAnswerRow, unknown, SaveAnswerVars>({
    mutationKey: mutationKeys.saveDecideAnswer,
    scope: WRITE_SCOPE,
  });
  return {
    save(a) {
      const shape = shapeOf(a);
      const cache = { userId, householdId };
      const live = qc
        .getQueryData<AnswerList>(queryKeys.decideAnswers(userId, householdId))
        ?.find((r) => r.kind === shape.kind && r.key === shape.key && r.deleted_at === null);
      if (!live) {
        const id = Crypto.randomUUID();
        const stepId = newStepId();
        mutation.mutate({ mode: 'insert', ownerId: userId, cache, row: { id, household_id: householdId, ...shape }, stepId });
        return { id, stepId };
      }
      const patch: DecideAnswerPatch = {};
      const before: Record<string, PatchValue> = {};
      for (const field of VALUE_FIELDS) {
        if (shape[field] !== null && shape[field] !== live[field]) {
          (patch as Record<string, unknown>)[field] = shape[field];
          before[field] = live[field];
        }
      }
      if (Object.keys(patch).length === 0) return null;
      const stepId = newStepId();
      mutation.mutate({
        mode: 'update',
        id: live.id,
        ownerId: userId,
        cache,
        expectedVersion: live.version,
        patch,
        undo: { stepId, before },
      });
      return { id: live.id, stepId };
    },
  };
}

/** Soft delete an answer. Returns the step id; the caller toasts "Answer removed" with Undo. */
export function useRemoveDecideAnswer(
  userId: string,
  householdId: string
): { remove(row: DecideAnswerRow): { stepId: string } } {
  const mutation = useMutation<DecideAnswerRow, unknown, RemoveAnswerVars>({
    mutationKey: mutationKeys.removeDecideAnswer,
    scope: WRITE_SCOPE,
  });
  return {
    remove(row) {
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: userId,
        cache: { userId, householdId },
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: { stepId, before: { deleted_at: null } },
      });
      return { stepId };
    },
  };
}
