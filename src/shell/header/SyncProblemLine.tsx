// D-15 / D-88: the same SyncStatusLine as You, shown under the header only when something needs attention.
// The line itself decides (a write younger than 5 s is not worth a line), so the padding wrapper is handed to it
// and only appears with the line.
import React from 'react';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { space } from '@/theme/layout';
import { hasSyncProblem } from './syncProblem';

export function SyncProblemLine({ inset = true }: { inset?: boolean } = {}) {
  const status = useSyncStatus();
  if (!hasSyncProblem(status)) return null;
  return (
    <SyncStatusLine
      wrapperTestID="sync-problem-line"
      wrapperStyle={{ paddingHorizontal: inset ? space.screenH : 0, paddingBottom: space.gapSm }}
    />
  );
}
