// 06.1-18 (D52, D-20): the one place a Decide answer is allowed to use the safety net. Unlock is behind this confirm; the primary is
// the accent Unlock, and Keep it locked writes nothing. Unlocking is a warning haptic and a toast with Undo (made by the hook).
import React from 'react';
import { useSetNetAnswerUse } from '@/data/mutations/decideNetUse';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticWarning } from '@/ui/haptics';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface UnlockConfirmProps {
  visible: boolean;
  /** The flagged safety-net goal. */
  goal: SavingsGoalRow | null;
  ownerId: string | null;
  /** The size (or, with no size, the saved amount) already formatted, for the body. */
  amountText: string;
  onClose: () => void;
}

export function UnlockConfirm({ visible, goal, ownerId, amountText, onClose }: UnlockConfirmProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const net = useSetNetAnswerUse();
  const unlock = (): void => {
    onClose();
    if (goal === null || ownerId === null) return;
    hapticWarning();
    net.mutate({ goal, on: true, ownerId });
  };
  return (
    <ConfirmSheet
      visible={visible}
      title={t('decide.screens.safetyNet.unlock.title')}
      body={t('decide.screens.safetyNet.unlock.body', { amount: amountText })}
      cancelLabel={t('decide.screens.safetyNet.unlock.keep')}
      confirmLabel={t('decide.screens.safetyNet.unlock.unlock')}
      onCancel={onClose}
      onConfirm={unlock}
    />
  );
}
