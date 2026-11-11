// 06-22 (D-29): "Use as my safety net" on an existing goal. Before anything is saved it says what Decide will do, in plain words,
// and names the swap when a net already exists. One save (set_safety_net swaps the old net in the same write), one Undo.
// Dismissing the sheet or "Keep as is" writes nothing.
import React from 'react';
import { useSetSafetyNet } from '@/data/mutations/growGoals';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';

export interface UseAsSafetyNetSheetProps {
  visible: boolean;
  goal: SavingsGoalRow;
  /** The current safety net row, or null. */
  currentNet: SavingsGoalRow | null;
  ownerId: string | null;
  /** Display amounts, already formatted. */
  savedText: string;
  netSavedText: string;
  onClose: () => void;
  /** Called after the save is queued, with the undo step id (null when nothing was queued). */
  onSet: (stepId: string | null) => void;
}

export function UseAsSafetyNetSheet({ visible, goal, currentNet, ownerId, savedText, netSavedText, onClose, onSet }: UseAsSafetyNetSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { set } = useSetSafetyNet();
  const effect = goal.locked === true ? 'grow.goals.useAsSafetyNet.effectLocked' : 'grow.goals.useAsSafetyNet.effectNormal';
  const swapped = currentNet !== null && currentNet.id !== goal.id;
  const confirm = () => {
    if (ownerId === null) return;
    const stepId = set(goal, currentNet, ownerId);
    hapticLight();
    onClose();
    onSet(stepId);
  };
  const body = [
    t(effect, { amount: savedText }),
    swapped ? t('grow.goals.useAsSafetyNet.swap', { name: (currentNet as SavingsGoalRow).name, amount: netSavedText }) : null,
  ]
    .filter((line): line is string => line !== null)
    .join(' ');
  return (
    <ConfirmSheet
      visible={visible}
      title={t('grow.goals.useAsSafetyNet.row')}
      body={body}
      cancelLabel={t('grow.goals.useAsSafetyNet.keep')}
      confirmLabel={t('grow.goals.useAsSafetyNet.confirm')}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}
