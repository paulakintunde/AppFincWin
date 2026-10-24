// 05-113 (D-99, R17.3): the Open checks list on its own pushed screen. The list, swipe and ⋯ Delete, the changed
// markers and the combine behaviour are OpenChecksCard's; with no checks the heading links remain.
import React from 'react';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { OpenChecksCard } from './OpenChecksCard';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';

export function OpenChecksScreen() {
  const t = useT();
  const vm = useDecideHomeViewModel();
  return (
    <DetailScreen title={t('decide.open.heading')}>
      <OpenChecksCard source={vm.source} checks={vm.openChecks} today={vm.today} whole={vm.whole} currency={vm.currency} showWhenEmpty />
    </DetailScreen>
  );
}
