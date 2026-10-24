// D-107: the one Judge-on choice (This month / Worst / Average) shared by the home card, Month details and every check.
// A module store (like state/activityFocus.ts) because the home stays mounted under a pushed check. The choice lives on this
// device only (decideHints record, wiped with local data); `null` means the stored choice has not been read yet, so a
// snapshot waits instead of flashing a verdict on the wrong basis. Default 'month' for everyone.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadJudgeOn, saveJudgeOn, type JudgeOn } from '@/features/decide/hints/decideHints';
import { registerWipeHandler } from '@/services/storage/wipe';

export type { JudgeOn };

interface StoreState {
  userId: string | null;
  value: JudgeOn | null;
  loaded: boolean;
}

const INITIAL: StoreState = { userId: null, value: null, loaded: false };
let state: StoreState = INITIAL;
let loadingFor: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function startLoad(userId: string): void {
  if (loadingFor === userId) return;
  loadingFor = userId;
  void loadJudgeOn(userId)
    .catch(() => null)
    .then((stored) => {
      // A late result for a previous user, or one the user already overrode, is dropped.
      if (loadingFor !== userId || (state.userId === userId && state.loaded)) return;
      state = { userId, value: stored ?? 'month', loaded: true };
      notify();
    });
}

function reset(): void {
  state = INITIAL;
  loadingFor = null;
  notify();
}

/** The current choice for `userId`, or null while it is being read. */
function currentFor(userId: string | null): JudgeOn | null {
  if (userId === null) return 'month';
  return state.userId === userId && state.loaded ? state.value : null;
}

export function useJudgeOn(userId: string | null): { judgeOn: JudgeOn | null; setJudgeOn(v: JudgeOn): void } {
  const judgeOn = useSyncExternalStore(subscribe, () => currentFor(userId));
  useEffect(() => {
    if (userId === null) return;
    startLoad(userId);
  }, [userId]);
  const setJudgeOn = useCallback(
    (v: JudgeOn) => {
      if (userId === null) return;
      if (state.userId === userId && state.loaded && state.value === v) return;
      state = { userId, value: v, loaded: true };
      loadingFor = userId; // a read still in flight must not overwrite this choice
      notify();
      void saveJudgeOn(userId, v);
    },
    [userId]
  );
  return { judgeOn, setJudgeOn };
}

/** Test seam: forget the choice and any read in flight. */
export function resetJudgeOnStoreForTest(): void {
  reset();
}

registerWipeHandler({
  id: 'decide-judge-on',
  wipe: async () => {
    reset();
  },
});
