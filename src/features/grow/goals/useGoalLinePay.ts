// 06-37 (D-32 check, 06-34 follow-up): one way to mark a goal's Expected line paid, shared by Activity's row actions and
// the record sheet's occurrence actions. The goal grows only through confirm_goal_contribution, the same confirm Grow
// uses, so a plain status patch never flips a goal line to paid. With the goal not loaded yet nothing is written and a
// "not ready" hint shows, so the tap is never silently lost.
import { useCallback } from 'react';
import { useConfirmGoalContribution, type ConfirmContributionInput } from '@/data/mutations/growGoals';
import { useSavingsGoals } from '@/data/queries/decide';
import { showToast } from '@/state/undoToast';
import { useGoalToast } from './useGoalToast';

export interface GoalLinePay {
  /**
   * Confirms `line` into `goalId` with the Undo toast Grow shows. Returns false when the goal has not loaded: nothing is
   * written and the not-ready hint shows instead.
   */
  pay(line: ConfirmContributionInput['line'], goalId: string): boolean;
}

export function useGoalLinePay(ownerId: string | null, householdId: string | null): GoalLinePay {
  const goals = useSavingsGoals(ownerId ?? undefined, householdId ?? undefined).data;
  const { confirm } = useConfirmGoalContribution();
  const goalToast = useGoalToast();

  const pay = useCallback(
    (line: ConfirmContributionInput['line'], goalId: string): boolean => {
      const goal = ownerId === null ? undefined : goals?.find((g) => g.id === goalId);
      if (ownerId === null || goal === undefined) {
        showToast({ kind: 'info', text: { key: 'record.sheet.goalLineNotReady' } });
        return false;
      }
      const stepId = confirm({
        ownerId,
        line,
        goal: { id: goal.id, name: goal.name, currency: goal.currency, account_id: goal.account_id ?? null },
      });
      goalToast({
        key: 'undo.label.goalContributionConfirmed',
        stepId,
        undoLabel: 'goalContributionConfirmed',
        name: goal.name,
        userId: ownerId,
        householdId,
      });
      return true;
    },
    [ownerId, householdId, goals, confirm, goalToast]
  );

  return { pay };
}
