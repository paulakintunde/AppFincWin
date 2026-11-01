/**
 * 05.3-74 (UAT gap 9): true once no create or draft save for this check id is still in flight.
 * The v3 draft creates the check on the first keystroke and saves the rest through a debounced serial queue, so for a
 * moment the cached row is the first copy (name 'C', no price). Plan it / Not buying wait for this before they write,
 * so the outcome and answer_v3 are stamped from the inputs the user saw. A save paused with the app offline counts as settled (05.3-102: one queued behind another write while online does not):
 * its optimistic patch is already in the cache and the outcome queues behind it in the same serial scope.
 */
import { useSyncExternalStore } from 'react';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';
import { isOfflinePaused } from '@/data/sync/writeQueueState';

const isSaveKey = (key: readonly unknown[] | undefined): boolean =>
  key !== undefined &&
  key.length === 2 &&
  key[0] === mutationKeys.createCheck[0] &&
  (key[1] === mutationKeys.createCheck[1] || key[1] === mutationKeys.saveCheckDraft[1]);

export function useCheckWritesSettled(checkId: string): boolean {
  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline());
  // The filter holds the pending saves; whether each is paused offline is read at render, because going offline fires no cache event.
  const pending = useMutationState<{ isPaused: boolean }>({
    filters: {
      predicate: (m) =>
        isSaveKey(m.options.mutationKey) &&
        (m.state.variables as { id?: string } | undefined)?.id === checkId &&
        m.state.status === 'pending',
    },
    select: (m) => ({ isPaused: m.state.isPaused }),
  });
  return pending.every((m) => isOfflinePaused({ status: 'pending', isPaused: m.isPaused }, online));
}
