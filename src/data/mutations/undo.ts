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
import type { UndoLogRow } from '@/db/rows';
import type { UndoConflict, UndoLabelKey, UndoLabelParams } from '@/engine/undo';
import { applyUndoStep, fetchUndoStepMeta, rollbackUndoTo, type RollbackOutcome, type UndoOutcome } from '@/db/undoLog';
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
  /**
   * 05.3-97: the row the toast named. Optional so a paused undo persisted by an installed build still replays. When set, the
   * step's label and touched rows are checked before it is applied; a step that is not the one shown is never applied.
   */
  expect?: { entityId: string };
}

/** 'mismatch': the step on the server is not the one the toast was shown for. Nothing was sent to apply_undo_step. */
export type UndoRunOutcome = UndoOutcome | { status: 'mismatch' };

export type RollbackVars = Omit<UndoVars, 'labelKey' | 'labelParams' | 'expect'>;

/** An undo can touch transactions, accounts, categories, series and Decide rows: refresh every one. */
function invalidateAfterUndo(qc: QueryClient, vars: { householdId: string; ownerId: string }): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess is awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
  // Decide rows are undoable too (checks, links, changes, debts, pots). Without these the cache kept the pot an Undo had just
  // soft-deleted (walkthrough 2): the server reverted, the screen did not.
  void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideLinks(vars.ownerId, vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideChanges(vars.ownerId, vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) });
  // 05.2 Decide setup rows (N-04): Not regular / Not my pay, setup answers, Reset, payer rules. Without these the server
  // reverted and the step kept showing the old state until it was re-opened.
  void qc.invalidateQueries({ queryKey: queryKeys.recurringDismissals(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideSettings(vars.ownerId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideAnswers(vars.ownerId, vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.incomePayerPrompts(vars.householdId) });
}

async function recordRefusal(
  entityId: string,
  conflict: UndoConflict | null,
  stepId: string,
  label?: { key: UndoLabelKey; name?: string }
): Promise<void> {
  await recordFailedWrite({
    entity: 'undo_log',
    entityId,
    kind: 'conflict',
    code: 'version-conflict',
    attempted: {
      stepId,
      ...(label ? { labelKey: label.key, ...(label.name ? { name: label.name } : {}) } : {}),
      ...(conflict ? { conflictEntity: conflict.entity, conflictId: conflict.id } : {}),
    },
  });
}

/** Decide check steps whose Undo is label-guarded even without `expect` (05.3-97). */
const DECIDE_CHECK_LABELS: ReadonlySet<string> = new Set([
  'planSaved',
  'notBuyingSaved',
  'decisionWritten',
  'decisionDeleted',
  'checkDeleted',
  'checkCleared',
]);

export function registerUndoMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.undoStep, {
    mutationFn: (vars: UndoVars): Promise<UndoRunOutcome> =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // 05.3-97: confirm the step is the one the toast was shown for before replaying it. An undo with no `expect` (a paused one
        // persisted by an older build, or a toast that names no row) is guarded by label for the Decide check steps, where a
        // wrong step edits a saved decision; every other undo is sent as before, with no extra read.
        if (vars.expect === undefined && !DECIDE_CHECK_LABELS.has(vars.labelKey)) return applyUndoStep(client, vars.stepId);
        const meta = await fetchUndoStepMeta(client, vars.stepId);
        if (meta === null) return { status: 'not-found' } as const;
        if (meta.labelKey !== vars.labelKey) return { status: 'mismatch' } as const;
        if (vars.expect !== undefined && !meta.touchedIds.includes(vars.expect.entityId)) return { status: 'mismatch' } as const;
        return applyUndoStep(client, vars.stepId);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: UndoVars) => {
      markSession(vars); // WR-A09
    },
    // History must never keep a stale list: refresh after every outcome, including not-found and a thrown error (05.3-111).
    onSettled: (_data: UndoRunOutcome | undefined, _err: unknown, vars: UndoVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onSuccess: async (outcome: UndoRunOutcome, vars: UndoVars) => {
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
          await recordRefusal(vars.stepId, outcome.conflict, vars.stepId, {
            key: vars.labelKey,
            name: vars.labelParams.name,
          });
          invalidateAfterUndo(qc, vars);
          showToast({ kind: 'refusal', refusal: outcome.conflict });
          return;
        case 'mismatch':
          void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
          showToast({ kind: 'info', text: { key: 'undo.wrongStep' } });
          return;
        case 'not-found':
          void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
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
      // Optimistic: hide the rows being rolled back (the target and every newer one). The settled refetch restores any the
      // server refused.
      const key = queryKeys.undoLog(vars.ownerId);
      const cached = qc.getQueryData<UndoLogRow[]>(key);
      if (cached) {
        const at = cached.findIndex((r) => r.id === vars.stepId);
        if (at >= 0) qc.setQueryData<UndoLogRow[]>(key, cached.slice(at + 1));
      }
      return { before: cached };
    },
    onSettled: (_data: RollbackOutcome | undefined, _err: unknown, vars: RollbackVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onSuccess: async (outcome: RollbackOutcome, vars: RollbackVars, context: { before?: UndoLogRow[] } | undefined) => {
      switch (outcome.status) {
        case 'undone':
          invalidateAfterUndo(qc, vars);
          showToast({ kind: 'info', text: { key: 'undo.rolledBack', params: { count: outcome.undone } } });
          return;
        case 'refused':
        case 'blocked': {
          const stepId = outcome.status === 'refused' ? outcome.stepId : outcome.blockedBy;
          // A step that was already refused earlier blocks without a fresh conflict: nothing new to record.
          if (outcome.conflict) {
            const row = (context?.before ?? qc.getQueryData<UndoLogRow[]>(queryKeys.undoLog(vars.ownerId)))?.find((r) => r.id === stepId);
            const name = row?.label_params?.name;
            await recordRefusal(
              stepId,
              outcome.conflict,
              stepId,
              row ? { key: row.label_key as UndoLabelKey, ...(typeof name === 'string' ? { name } : {}) } : undefined
            );
          }
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
  const mutation = useMutation<UndoRunOutcome, unknown, UndoVars>({
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
