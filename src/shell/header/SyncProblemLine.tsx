// D-15: the same SyncStatusLine as You, shown under the header only when something needs attention.
import React from 'react';
import { View } from 'react-native';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { space } from '@/theme/layout';
import { hasSyncProblem } from './syncProblem';

export function SyncProblemLine() {
  const status = useSyncStatus();
  if (!hasSyncProblem(status)) return null;
  return (
    <View style={{ paddingHorizontal: space.screenH, paddingBottom: space.gapSm }}>
      <SyncStatusLine />
    </View>
  );
}
