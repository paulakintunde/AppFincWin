// 06-22: one place the goal screens raise their toast with Undo. The 06-12 hooks record the undo step and its label; this
// only shows the message and, on Undo, replays that step and then refreshes the goal reads (D-29: a set_safety_net step does
// not bump row versions, so the screens refetch instead of guessing version + 1). The screens never build a label key.
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshGoalReads } from '@/data/mutations/growGoals';
import { useUndo } from '@/data/mutations/undo';
import type { UndoLabelKey } from '@/engine/undo';
import { showToast } from '@/state/undoToast';

export interface GoalToastInput {
  /** An i18n key under en (a grow.goals string, or `undo.label.<key>` for the registry's own wording). */
  key: string;
  params?: Record<string, string | number>;
  stepId: string | null;
  /** The label the 06-12 hook recorded the step with (used only to replay it). */
  undoLabel: UndoLabelKey;
  name: string;
  userId: string | null;
  householdId: string | null;
}

export function useGoalToast(): (input: GoalToastInput) => void {
  const { undo } = useUndo();
  const qc = useQueryClient();
  return useCallback(
    ({ key, params, stepId, undoLabel, name, userId, householdId }) => {
      const canUndo = stepId !== null && userId !== null && householdId !== null;
      showToast({
        kind: 'destructive',
        text: { key, params: { ...(params ?? {}), name } },
        ...(canUndo
          ? {
              stepId,
              onUndo: () => {
                undo({ stepId, ownerId: userId, householdId, labelKey: undoLabel, labelParams: { name } });
                refreshGoalReads(qc, { userId, householdId });
              },
            }
          : {}),
      });
    },
    [undo, qc]
  );
}
