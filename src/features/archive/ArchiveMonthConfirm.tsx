// 10-16 (UI-SPEC 4d, D-13, D-15): confirm before a month leaves the person's Activity and search. Nothing about money changes, so
// the sheet is not destructive-styled and there is no haptic. The household line shows only when the person shares a household.
import React from 'react';
import { useT } from '@/i18n';
import { ConfirmSheet } from '@/ui/ConfirmSheet';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface ArchiveMonthConfirmProps {
  visible: boolean;
  /** The month's long name, e.g. 'March 2026'. */
  monthLabel: string;
  /** True when the person shares a household (partners still see the month). */
  shared: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ArchiveMonthConfirm({ visible, monthLabel, shared, onConfirm, onCancel }: ArchiveMonthConfirmProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const body = t('system.archive.confirmBody');
  return (
    <ConfirmSheet
      visible={visible}
      title={t('system.archive.confirmTitle', { month: monthLabel })}
      body={shared ? `${body} ${t('system.archive.confirmShared')}` : body}
      cancelLabel={t('system.archive.cancel')}
      confirmLabel={t('system.archive.confirmPrimary')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
