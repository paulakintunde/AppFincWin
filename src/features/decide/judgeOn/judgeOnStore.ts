// D-107: the one Judge-on choice (This month / Worst / Average) shared by the home card, Month details and every check.
// A module store (like state/activityFocus.ts) because the home stays mounted under a pushed check. The choice lives on this
// device only (decideHints record, wiped with local data); `null` means the stored choice has not been read yet, so a
// snapshot waits instead of flashing a verdict on the wrong basis. Default 'month' for everyone.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadJudgeOn, loadJudgeOnDefaulted, markJudgeOnDefaulted, saveJudgeOn, type JudgeOn } from '@/features/decide/hints/decideHints';
import { registerWipeHandler } from '@/services/storage/wipe';

export type { JudgeOn };

interface StoreState {
  userId: string | null;
  value: JudgeOn | null;
  loaded: boolean;
  /** True while no choice is stored and the one-time default switch has not run: checks still judge on the settings basis. */
  pendingDefault: boolean;
  /** True from the moment the default switch starts re-baselining until it resolves: the snapshot waits (no checks are judged), so no order of the two changes can show "N changed". */
  applying: boolean;
}

const INITIAL: StoreState = { userId: null, value: null, loaded: false, pendingDefault: false, applying: false };
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
  void Promise.all([loadJudgeOn(userId).catch(() => null), loadJudgeOnDefaulted(userId).catch(() => true)]).then(([stored, defaulted]) => {
    // A late result for a previous user, or one the user already overrode, is dropped.
    if (loadingFor !== userId || (state.userId === userId && state.loaded)) return;
    state = { userId, value: stored ?? 'month', loaded: true, pendingDefault: stored === null && !defaulted, applying: false };
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

function pendingFor(userId: string | null): boolean {
  return userId !== null && state.userId === userId && state.loaded && state.pendingDefault;
}

export function useJudgeOn(userId: string | null): {
  judgeOn: JudgeOn | null;
  /** The default switch to This month has not been resolved yet; consumers judge on the settings basis until it is. */
  pendingDefault: boolean;
  /** The default switch is re-baselining the checks right now; consumers hold the snapshot back until it resolves. */
  applyingDefault: boolean;
  setJudgeOn(v: JudgeOn): void;
  beginDefault(): void;
  resolveDefault(): void;
} {
  const judgeOn = useSyncExternalStore(subscribe, () => currentFor(userId));
  const pendingDefault = useSyncExternalStore(subscribe, () => pendingFor(userId));
  const applyingDefault = useSyncExternalStore(subscribe, () => pendingFor(userId) && state.applying);
  useEffect(() => {
    if (userId === null) return;
    startLoad(userId);
  }, [userId]);
  const setJudgeOn = useCallback(
    (v: JudgeOn) => {
      if (userId === null) return;
      if (state.userId === userId && state.loaded && state.value === v && !state.pendingDefault) return;
      state = { userId, value: v, loaded: true, pendingDefault: false, applying: false };
      loadingFor = userId; // a read still in flight must not overwrite this choice
      notify();
      void saveJudgeOn(userId, v);
    },
    [userId]
  );
  const resolveDefault = useCallback(() => {
    if (userId === null || !pendingFor(userId)) return;
    state = { ...state, pendingDefault: false, applying: false };
    notify();
    void markJudgeOnDefaulted(userId);
  }, [userId]);
  const beginDefault = useCallback(() => {
    if (userId === null || !pendingFor(userId) || state.applying) return;
    state = { ...state, applying: true };
    notify();
  }, [userId]);
  return { judgeOn, pendingDefault, applyingDefault, setJudgeOn, beginDefault, resolveDefault };
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
