// 08-19 (D-16): sharing a line that sits in a repeating series asks whether every month is shared or only this one.
// The server's series scope does the rest: past lines stay as they are.
import React from 'react';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { useT } from '@/i18n';

export interface ShareSeriesPromptProps {
  visible: boolean;
  /** "Share every month": this line and all future lines. */
  onAll: () => void;
  /** "Just this one" (also what dismissing the sheet means). */
  onOne: () => void;
}

export function ShareSeriesPrompt({ visible, onAll, onOne }: ShareSeriesPromptProps) {
  const t = useT();
  return (
    <ConfirmSheet
      visible={visible}
      title={t('household.sharing.seriesTitle')}
      body={t('household.sharing.seriesBody')}
      confirmLabel={t('household.sharing.seriesAll')}
      cancelLabel={t('household.sharing.seriesOne')}
      onConfirm={onAll}
      onCancel={onOne}
      onDismiss={onOne}
    />
  );
}
