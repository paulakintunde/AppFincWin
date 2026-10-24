// 05-113 (D-99, R17.3): Changes coming up on its own pushed screen, with "+ Add a change" and the ChangeSheet editor.
import React from 'react';
import { useDecideChanges } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { ChangesCard } from './ChangesCard';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';

export function ChangesScreen() {
  const t = useT();
  const rc = useRecordContext();
  const vm = useDecideHomeViewModel();
  const changes = useDecideChanges(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  return (
    <DetailScreen title={t('decide.depth.changes.heading')}>
      <ChangesCard changes={changes ?? []} currency={vm.currency} whole={vm.whole} showWhenEmpty />
    </DetailScreen>
  );
}
