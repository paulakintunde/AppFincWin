// Undo and "roll back to here" (REC-11, REC-12, D-26..D-29). Both run through the same serial
// WRITE_SCOPE queue as every other write, so they work offline and replay in the order the
// user acted: a queued undo-record (undoCapture.ts) always lands before a queued undo-apply
// that was issued after it.
//
// A refusal is an outcome, not an error: the mutationFn RETURNS `refused`/`blocked`/`not-found`
// so the queue carries on and the step is never retried. The server has already marked a
// refused step as refused in history; this module records the "changed elsewhere" failed write
// (D-19) and raises a refusal toast carrying who and what (D-26). Only transport/DB errors throw.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { UndoConflict, UndoLabelKey, UndoLabelParams } from '@/engine/undo';
import { applyUndoStep, rollbackUndoTo, type RollbackOutcome, type UndoOutcome } from '@/db/undoLog';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';

export interface UndoVars {
  stepId: string;
  ownerId: string;
  householdId: string;
  labelKey: UndoLabelKey;
  labelParams: UndoLabelParams;
}

export type RollbackVars = Omit<UndoVars, 'labelKey' | 'labelParams'>;

/** An undo can touch transactions, accounts, categories and series: refresh every one. */
function invalidateAfterUndo(qc: QueryClient, vars: { householdId: string; ownerId: string }): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess is awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
}

async function recordRefusal(entityId: string, conflict: UndoConflict | null, stepId: string): Promise<void> {
  await recordFailedWrite({
    entity: 'undo_log',
    entityId,
    kind: 'conflict',
    code: 'version-conflict',
    attempted: { stepId, ...(conflict ? { conflictEntity: conflict.entity, conflictId: conflict.id } : {}) },
  });
}

export function registerUndoMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.undoStep, {
    mutationFn: (vars: UndoVars): Promise<UndoOutcome> =>
      guardSession(vars, async () => applyUndoStep(await writeClient(), vars.stepId)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: UndoVars) => {
      markSession(vars); // WR-A09
    },
    onSuccess: async (outcome: UndoOutcome, vars: UndoVars) => {
      switch (outcome.status) {
        case 'undone':
        case 'already-undone':
          invalidateAfterUndo(qc, vars);
          // The host composes t('undo.reverted', { label: t(`undo.label.${labelKey}`, params) }).
          showToast({
            kind: 'info',
            text: { key: 'undo.reverted', params: { labelKey: vars.labelKey, ...definedParams(vars.labelParams) } },
          });
          return;
        case 'refused':
          await recordRefusal(vars.stepId, outcome.conflict, vars.stepId);
          invalidateAfterUndo(qc, vars);
          showToast({ kind: 'refusal', refusal: outcome.conflict });
          return;
        case 'not-found':
          showToast({ kind: 'info', text: { key: 'undo.notRecorded' } });
          return;
      }
    },
    onError: async (err: unknown, vars: UndoVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      await recordFailedWrite({
        entity: 'undo_log',
        entityId: vars.stepId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { stepId: vars.stepId },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.rollbackUndo, {
    mutationFn: (vars: RollbackVars): Promise<RollbackOutcome> =>
      guardSession(vars, async () => rollbackUndoTo(await writeClient(), vars.stepId)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: RollbackVars) => {
      markSession(vars); // WR-A09
    },
    onSuccess: async (outcome: RollbackOutcome, vars: RollbackVars) => {
      switch (outcome.status) {
        case 'undone':
          invalidateAfterUndo(qc, vars);
          showToast({ kind: 'info', text: { key: 'undo.rolledBack', params: { count: outcome.undone } } });
          return;
        case 'refused':
        case 'blocked': {
          const stepId = outcome.status === 'refused' ? outcome.stepId : outcome.blockedBy;
          // A step that was already refused earlier blocks without a fresh conflict: nothing new to record.
          if (outcome.conflict) await recordRefusal(stepId, outcome.conflict, stepId);
          invalidateAfterUndo(qc, vars);
          showToast({
            kind: 'refusal',
            refusal: outcome.conflict,
            text: outcome.undone > 0 ? { key: 'undo.rolledBack', params: { count: outcome.undone } } : null,
          });
          return;
        }
        case 'not-found':
          showToast({ kind: 'info', text: { key: 'undo.notRecorded' } });
          return;
      }
    },
    onError: async (err: unknown, vars: RollbackVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      await recordFailedWrite({
        entity: 'undo_log',
        entityId: vars.stepId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { stepId: vars.stepId },
      });
    },
  });
}

function definedParams(params: UndoLabelParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (params.n !== undefined) out.n = params.n;
  if (params.name !== undefined) out.name = params.name;
  return out;
}

export function useUndo(): { undo(vars: UndoVars): void } {
  const mutation = useMutation<UndoOutcome, unknown, UndoVars>({
    mutationKey: mutationKeys.undoStep,
    scope: WRITE_SCOPE,
  });
  return {
    undo(vars: UndoVars): void {
      mutation.mutate(vars);
    },
  };
}

export function useRollbackUndo(): { rollbackTo(vars: RollbackVars): void } {
  const mutation = useMutation<RollbackOutcome, unknown, RollbackVars>({
    mutationKey: mutationKeys.rollbackUndo,
    scope: WRITE_SCOPE,
  });
  return {
    rollbackTo(vars: RollbackVars): void {
      mutation.mutate(vars);
    },
  };
}
