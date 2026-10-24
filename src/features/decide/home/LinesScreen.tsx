// 05-113 (D-99, R17.3): Lines you will not cross on its own pushed screen: the sub-copy and the five rows, each opening the
// limit editor sheet. No fold here; the home row is the way in.
import React from 'react';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { LinesCard } from './LinesCard';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';

export function LinesScreen() {
  const t = useT();
  const rc = useRecordContext();
  const vm = useDecideHomeViewModel();
  return (
    <DetailScreen title={t('decide.lines.heading')}>
      <LinesCard source={vm.source} settings={vm.settings} userId={rc.userId} currency={vm.currency} whole={vm.whole} flat />
    </DetailScreen>
  );
}
