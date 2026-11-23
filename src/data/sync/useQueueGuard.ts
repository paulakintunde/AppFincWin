import { useCallback } from 'react';
import { canAdd as canAddTo, queueCap, type QueueCapState } from './queueCap';
import { useSyncStatus } from './useSyncStatus';

export interface QueueGuard {
  state: QueueCapState;
  queued: number;
  /** True when `adding` more new entries still fit under the cap. Edits and deletes never ask this. */
  canAdd: (adding: number) => boolean;
}

/** 10-13: the one place a create surface asks whether the waiting-changes queue has room. */
export function useQueueGuard(): QueueGuard {
  const { queued } = useSyncStatus();
  const canAdd = useCallback((adding: number) => canAddTo(queued, adding), [queued]);
  return { state: queueCap(queued), queued, canAdd };
}
