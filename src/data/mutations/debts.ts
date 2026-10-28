// 05-122 (D-103, R18.4): the housing marker on a loan. A paused-mutation write, version-conditional with the undo
// step id as the replay key, optimistic on the debts cache so the hero and the Lines value change at once. One undo
// step (apply_patches, entity debts, label debtHousingChanged). A version conflict is parked in the failed-writes
// list ("edit changed on another device"). Cards are never housing (the guard forces the flag off for them).
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfPatches } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { updateDebt, type DebtRow } from '@/db/debts';
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
import { acceptIfAlreadyApplied } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type DebtList = WithPending<DebtRow>[];

export interface SetDebtHousingVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  isHousing: boolean;
  before: boolean;
  stepId: string;
}

export type PaysInFull = 'yes' | 'sometimes' | 'no' | null;

export interface SetDebtPaysInFullVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  value: PaysInFull;
  before: PaysInFull;
  /** The Undo wording for setupStepSaved ({{name}}), supplied by the caller from i18n. */
  stepTitle: string | null;
  stepId: string;
}

function invalidateDebts(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.debts(householdId) });
}

export function registerDebtMutations(qc: QueryClient): void {
  // 05.2-15 (DSU-06): how a card is paid off each month. Same shape as the housing write; label setupStepSaved.
  qc.setMutationDefaults(mutationKeys.setDebtPaysInFull, {
    mutationFn: (vars: SetDebtPaysInFullVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { pays_in_full: vars.value };
        const row = await updateDebt(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'setupStepSaved',
          vars.stepTitle ? { name: vars.stepTitle } : {},
          inverseOfPatches('debts', [{ id: row.id, before: { pays_in_full: vars.before }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetDebtPaysInFullVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, pays_in_full: vars.value, pending: true } : r))
      );
    },
    onSuccess: (row: DebtRow, vars: SetDebtPaysInFullVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === row.id ? row : r))
      );
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: SetDebtPaysInFullVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      invalidateDebts(qc, vars.householdId);
      await recordFailedWrite({
        entity: 'debts',
        entityId: vars.id,
        kind: cls,
        code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { labelKey: 'setupStepSaved', fields: 1 },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.setDebtHousing, {
    mutationFn: (vars: SetDebtHousingVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { is_housing: vars.isHousing };
        const row = await updateDebt(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'debtHousingChanged',
          {},
          inverseOfPatches('debts', [{ id: row.id, before: { is_housing: vars.before }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetDebtHousingVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, is_housing: vars.isHousing, pending: true } : r))
      );
    },
    onSuccess: (row: DebtRow, vars: SetDebtHousingVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === row.id ? row : r))
      );
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: SetDebtHousingVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DebtRow | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
            serverRow.deleted_at
              ? (old ?? []).filter((r) => r.id !== vars.id)
              : (old ?? []).map((r) => (r.id === vars.id ? serverRow : r))
          );
        } else {
          invalidateDebts(qc, vars.householdId);
        }
        await recordFailedWrite({
          entity: 'debts',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: { labelKey: 'debtHousingChanged', fields: 1 },
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        invalidateDebts(qc, vars.householdId);
        await recordFailedWrite({
          entity: 'debts',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: { labelKey: 'debtHousingChanged', fields: 1 },
        });
      }
    },
  });
}

/**
 * Turn the housing marker on or off for a loan. Returns the undo step id (the caller toasts "Housing setting
 * changed" with Undo). A card is refused: cards are never housing and the switch is not offered for them.
 */
export function useSetDebtHousing(): { setHousing(debt: DebtRow, isHousing: boolean, ownerId: string): string } {
  const mutation = useMutation<DebtRow, unknown, SetDebtHousingVars>({
    mutationKey: mutationKeys.setDebtHousing,
    scope: WRITE_SCOPE,
  });
  return {
    setHousing(debt, isHousing, ownerId) {
      if (debt.kind === 'card') throw new RangeError('set debt housing: a card is never housing');
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        isHousing,
        before: debt.is_housing,
        stepId,
      });
      return stepId;
    },
  };
}

/** Save how a card is paid each month (yes, sometimes, no). Returns the undo step id. */
export function useSetDebtPaysInFull(): { setPaysInFull(debt: DebtRow, value: PaysInFull, ownerId: string, stepTitle?: string): string } {
  const mutation = useMutation<DebtRow, unknown, SetDebtPaysInFullVars>({
    mutationKey: mutationKeys.setDebtPaysInFull,
    scope: WRITE_SCOPE,
  });
  return {
    setPaysInFull(debt, value, ownerId, stepTitle) {
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        value,
        before: debt.pays_in_full ?? null,
        stepTitle: stepTitle ?? null,
        stepId,
      });
      return stepId;
    },
  };
}
