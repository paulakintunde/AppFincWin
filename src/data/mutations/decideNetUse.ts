// 06.1-12 (D-20): "answers may use my safety net" on or off, through set_net_answer_use. One queued write; the server builds the
// one Undo step (safetyNetUnlocked / safetyNetLocked). 'already-applied' and 'unchanged' are success; a version conflict is
// parked and the goals are read again. Variables are plain JSON; failed-write records carry ids and the column name only.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { VersionConflictError } from '@/db/errors';
import { setNetAnswerUse } from '@/db/netAnswerUse';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { undoLabelText } from '@/i18n/undoLabel';
import { refreshGoalReads, type GoalCacheKey } from './growGoals';
import { writeClient } from './writeClient';
import { newStepId } from './undoCapture';

type GoalList = WithPending<SavingsGoalRow>[];

export interface SetNetUseVars {
  ownerId: string;
  cache: GoalCacheKey;
  goalId: string;
  on: boolean;
  /** The goal's version when the user acted. */
  version: number;
  name: string;
  stepId: string;
}

function patchGoal(qc: QueryClient, cache: GoalCacheKey, goalId: string, on: boolean, pending: boolean): void {
  qc.setQueryData<GoalList>(queryKeys.savingsGoals(cache.userId, cache.householdId), (old) =>
    (old ?? []).map((r) => (r.id === goalId ? { ...r, decide_may_use: on, pending } : r))
  );
}

export function registerDecideNetUseMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideNetUse, {
    mutationFn: (vars: SetNetUseVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('savings_goals', vars.goalId, vars.version);
        const res = await setNetAnswerUse(await writeClient(), {
          goalId: vars.goalId,
          on: vars.on,
          expectedVersion: expected,
          undoStep: { id: vars.stepId, name: vars.name },
        });
        if (res.status === 'applied' && res.goalVersion !== null) {
          recordWrittenVersion('savings_goals', vars.goalId, [vars.version, expected], res.goalVersion);
        }
        return res;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetNetUseVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      patchGoal(qc, vars.cache, vars.goalId, vars.on, true);
    },
    onSuccess: (_res: unknown, vars: SetNetUseVars) => {
      // A later Undo does not bump the row version predictably, so read again rather than assume version + 1.
      refreshGoalReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: SetNetUseVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      patchGoal(qc, vars.cache, vars.goalId, !vars.on, false);
      refreshGoalReads(qc, vars.cache);
      await recordFailedWrite({
        entity: 'savings_goals',
        entityId: vars.goalId,
        kind: cls,
        code: err instanceof VersionConflictError ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { fields: ['decide_may_use'] },
      });
    },
  });
}

/**
 * Unlock or lock the safety net for Decide's answers. Unlock shows a toast with Undo; lock shows a plain "locked" toast.
 * Returns the undo step id.
 */
export function useSetNetAnswerUse(): {
  mutate(a: { goal: SavingsGoalRow; on: boolean; ownerId: string }): string | null;
} {
  const mutation = useMutation<unknown, unknown, SetNetUseVars>({ mutationKey: mutationKeys.decideNetUse, scope: WRITE_SCOPE });
  return {
    mutate({ goal, on, ownerId }) {
      if (goal.is_safety_net !== true) throw new RangeError('net answer use: that goal is not the safety net');
      if ((goal.decide_may_use === true) === on) return null;
      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        cache: { userId: ownerId, householdId: goal.household_id },
        goalId: goal.id,
        on,
        version: goal.version,
        name: goal.name,
        stepId,
      });
      if (on) showToast({ kind: 'ordinary', text: undoLabelText('safetyNetUnlocked', { name: goal.name }), stepId });
      else showToast({ kind: 'ordinary', text: { key: 'decide.screens.safetyNet.settings.lockedToast' } });
      return stepId;
    },
  };
}
