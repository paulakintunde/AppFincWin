// D-15: the same SyncStatusLine as You, shown under the header only when something needs attention.
import React from 'react';
import { View } from 'react-native';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { space } from '@/theme/layout';
import { hasSyncProblem } from './syncProblem';

export function SyncProblemLine({ inset = true }: { inset?: boolean } = {}) {
  const status = useSyncStatus();
  if (!hasSyncProblem(status)) return null;
  return (
    <View
      testID="sync-problem-line"
      style={{ paddingHorizontal: inset ? space.screenH : 0, paddingBottom: space.gapSm }}
    >
      <SyncStatusLine />
    </View>
  );
}
