// 05.2-15 (DSU-05, UI-SPEC owner decision 5): "Not regular" answers on found payments. Add writes a
// recurring_dismissals row (one live row per household + payee_key + direction) with a paymentDismissed undo step
// (inverseOfInserts = soft delete). Remove soft-deletes the row, version-conditional, with an undo step that puts it
// back. Unmarked candidates write nothing. Same shape as decidePots.ts: replay key is the step id, a duplicate
// client id (23505) is read back as landed, failed-write records hold ids only.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertDismissal,
  updateDismissal,
  type NewDismissal,
  type RecurringDismissalRow,
} from '@/db/recurringDismissals';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
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

type DismissalList = RecurringDismissalRow[];

export interface AddDismissalVars {
  ownerId: string;
  householdId: string;
  row: NewDismissal;
  stepId: string;
  /** Payment name for the undo label; omitted when the caller has none. */
  labelName?: string | null;
}

export interface RemoveDismissalVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  /** Fixed when the user acts, so a replay of a landed write compares equal (acceptIfAlreadyApplied). */
  deletedAt: string;
  stepId: string;
  labelName?: string | null;
}

function patchCache(qc: QueryClient, householdId: string, updater: (rows: DismissalList) => DismissalList): void {
  qc.setQueryData<DismissalList>(queryKeys.recurringDismissals(householdId), (old) => updater(old ?? []));
}

function invalidate(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.recurringDismissals(householdId) });
}

export function registerDismissalMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addDismissal, {
    mutationFn: (vars: AddDismissalVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // A duplicate client id (23505) is read back by insertDismissal: this exact write already landed.
        const row = await insertDismissal(client, vars.row);
        const step = buildStep(vars.stepId, 'paymentDismissed', vars.labelName ? { name: vars.labelName } : {}, inverseOfInserts('recurring_dismissals', [{ id: row.id, version: row.version }]));
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddDismissalVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringDismissals(vars.householdId) });
      const optimistic: RecurringDismissalRow = {
        ...vars.row,
        dismissed_at: new Date().toISOString(),
        created_by: vars.ownerId,
        deleted_at: null,
        version: 1,
      };
      patchCache(qc, vars.householdId, (rows) => upsertRow(rows, optimistic, 'end'));
    },
    onSuccess: (row: RecurringDismissalRow, vars: AddDismissalVars) => {
      patchCache(qc, vars.householdId, (rows) => upsertRow(rows, row, 'end'));
      invalidate(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: AddDismissalVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchCache(qc, vars.householdId, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'recurring_dismissals',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { labelKey: 'paymentDismissed' },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.removeDismissal, {
    mutationFn: (vars: RemoveDismissalVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('recurring_dismissals', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { deleted_at: vars.deletedAt };
        const row = await updateDismissal(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<RecurringDismissalRow>(err, patch)
        );
        recordWrittenVersion('recurring_dismissals', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'paymentRestored',
          vars.labelName ? { name: vars.labelName } : {},
          inverseOfPatches('recurring_dismissals', [{ id: row.id, before: { deleted_at: null }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RemoveDismissalVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.recurringDismissals(vars.householdId) });
      patchCache(qc, vars.householdId, (rows) => rows.filter((r) => r.id !== vars.id));
    },
    onSuccess: (_row: RecurringDismissalRow, vars: RemoveDismissalVars) => {
      invalidate(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: RemoveDismissalVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      // Put the row back by refetching: the cache no longer holds it.
      invalidate(qc, vars.householdId);
      await recordFailedWrite({
        entity: 'recurring_dismissals',
        entityId: vars.id,
        kind: cls,
        code: err instanceof VersionConflictError ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { labelKey: 'paymentDismissed' },
      });
    },
  });
}

/** Mark a found payment "Not regular". Returns the client id and the undo step id. */
export function useAddDismissal(
  householdId: string,
  ownerId: string
): { dismiss(input: { payeeKey: string; direction: 'in' | 'out'; name?: string | null }): { id: string; stepId: string } } {
  const mutation = useMutation<RecurringDismissalRow, unknown, AddDismissalVars>({
    mutationKey: mutationKeys.addDismissal,
    scope: WRITE_SCOPE,
  });
  return {
    dismiss({ payeeKey, direction, name }) {
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        householdId,
        row: { id, household_id: householdId, payee_key: payeeKey, direction },
        stepId,
        labelName: name ?? null,
      });
      return { id, stepId };
    },
  };
}

/** Change a "Not regular" answer back: soft-deletes the row. Returns the undo step id. */
export function useRemoveDismissal(householdId: string, ownerId: string): { restore(row: RecurringDismissalRow, name?: string | null): { stepId: string } } {
  const mutation = useMutation<RecurringDismissalRow, unknown, RemoveDismissalVars>({
    mutationKey: mutationKeys.removeDismissal,
    scope: WRITE_SCOPE,
  });
  return {
    restore(row, name) {
      const stepId = newStepId();
      mutation.mutate({ id: row.id, ownerId, householdId, expectedVersion: row.version, deletedAt: new Date().toISOString(), stepId, labelName: name ?? null });
      return { stepId };
    },
  };
}
