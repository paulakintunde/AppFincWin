// The undo-step recorder (REC-11, D-23, D-29): every undoable mutation calls
// `recordUndoStepSafely` at the moment its forward write succeeds, from the before-state
// captured when the action started and the version the server just returned -- never
// reconstructed later. When the immediate `insertUndoStep` call itself fails (offline, or a
// transient server error), the step is queued as its own `recordUndoStep` mutation instead
// of being lost -- D-29's "an undo step that cannot be written immediately is queued and
// retried on its own, never re-running the forward write".
//
// `useRecordUndoStep` exists for import and other queued-only callers (plan 02-15 Task 3's
// finalize step records its own undo step directly via insertUndoStep/applyPatches instead,
// but keeps this hook available for any caller that only ever wants the queued path).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { UndoLabelKey, UndoLabelParams, UndoStepDraft } from '@/engine/undo';
import { insertUndoStep } from '@/db/undoLog';
import type { DbClient } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface UndoCapture {
  stepId: string;
  ownerId: string;
  labelKey: UndoLabelKey;
  labelParams: UndoLabelParams;
}

export function newStepId(): string {
  return Crypto.randomUUID();
}

export interface RecordUndoStepVars {
  step: UndoStepDraft;
  ownerId: string;
}

export function registerUndoCaptureMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.recordUndoStep, {
    // D-25/insertUndoStep: a duplicate step id (this same step landing twice -- a retried
    // queued write, or the immediate attempt actually succeeding before the network answer
    // was lost) resolves as success, never a failure.
    mutationFn: (vars: RecordUndoStepVars) =>
      guardSession(vars, async () => insertUndoStep(await writeClient(), vars.step)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: RecordUndoStepVars) => {
      markSession(vars); // WR-A09
    },
    onSuccess: async (_result: void, vars: RecordUndoStepVars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
  });
}

/**
 * D-23/D-29: records `step` immediately. When that direct write throws (offline, or any
 * other failure), the step is queued as a `recordUndoStep` mutation instead -- this
 * function still resolves without throwing either way, so the caller's own forward write
 * (which already succeeded) is never rolled back or retried alongside it. The queued
 * attempt is fired and not awaited: it must never block the caller behind an offline pause
 * (mirrors WR-A15's non-awaited resolve-rate follow-up).
 */
export async function recordUndoStepSafely(
  qc: QueryClient,
  client: DbClient,
  step: UndoStepDraft,
  ownerId: string
): Promise<void> {
  try {
    await insertUndoStep(client, step);
    await qc.invalidateQueries({ queryKey: queryKeys.undoLog(ownerId) });
    return;
  } catch {
    // Falls through to the queued path below.
  }

  const mutation = qc.getMutationCache().build(qc, { mutationKey: mutationKeys.recordUndoStep });
  void mutation.execute({ step, ownerId } satisfies RecordUndoStepVars).catch(() => {
    // The queued write's own retry/paused-mutation handling owns this from here; a
    // permanent failure has nothing further for this caller to do; there is no
    // failed-writes entry for an undo step (there is no user-authored value to preserve
    // beyond what `step` itself already records, and the step is retried indefinitely by
    // shouldRetryWrite until it succeeds or the user signs out).
  });
}

export function useRecordUndoStep(): { record(vars: RecordUndoStepVars): void } {
  const mutation = useMutation<void, unknown, RecordUndoStepVars>({
    mutationKey: mutationKeys.recordUndoStep,
    scope: WRITE_SCOPE,
  });

  return {
    record(vars: RecordUndoStepVars): void {
      mutation.mutate(vars);
    },
  };
}
