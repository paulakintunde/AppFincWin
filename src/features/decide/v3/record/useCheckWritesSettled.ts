/**
 * 05.3-74 (UAT gap 9): true once no create or draft save for this check id is still in flight.
 * The v3 draft creates the check on the first keystroke and saves the rest through a debounced serial queue, so for a
 * moment the cached row is the first copy (name 'C', no price). Plan it / Not buying wait for this before they write,
 * so the outcome and answer_v3 are stamped from the inputs the user saw. A paused (offline) save counts as settled:
 * its optimistic patch is already in the cache and the outcome queues behind it in the same serial scope.
 */
import { useMutationState } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';

const isSaveKey = (key: readonly unknown[] | undefined): boolean =>
  key !== undefined &&
  key.length === 2 &&
  key[0] === mutationKeys.createCheck[0] &&
  (key[1] === mutationKeys.createCheck[1] || key[1] === mutationKeys.saveCheckDraft[1]);

export function useCheckWritesSettled(checkId: string): boolean {
  const inFlight = useMutationState<number>({
    filters: {
      predicate: (m) =>
        isSaveKey(m.options.mutationKey) &&
        (m.state.variables as { id?: string } | undefined)?.id === checkId &&
        m.state.status === 'pending' &&
        !m.state.isPaused,
    },
    select: (m) => m.state.submittedAt,
  });
  return inFlight.length === 0;
}
