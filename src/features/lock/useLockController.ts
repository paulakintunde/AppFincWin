// 10-21 (D-02, D-04, Pitfall 8): owns the AppState subscription for the phone lock and the app-switcher cover.
//  - 'inactive' or 'background': the cover goes up at once and the time is stored (once per trip to the background).
//  - 'active': the cover comes down; the lock goes up when the chosen time has passed (or on a cold start).
//  - While the system biometric prompt is open the app is "inactive" by the OS's doing, so AppState is ignored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isBiometricPending } from '@/services/lock/biometric';
import { loadLockState, markBackgrounded, shouldLockOnActive, type LockState } from '@/services/lock/lockStore';

export interface LockController {
  ready: boolean;
  locked: boolean;
  coverVisible: boolean;
  state: LockState | null;
  unlock: () => void;
  refresh: () => Promise<void>;
}

export function useLockController(): LockController {
  const [state, setState] = useState<LockState | null>(null);
  const [locked, setLocked] = useState(false);
  const [coverVisible, setCoverVisible] = useState(false);
  const [ready, setReady] = useState(false);
  // True between a background event we acted on and the next active event.
  const wentAway = useRef(false);
  const marking = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  // A restored process counts as a cold start (UI-SPEC 1d): the first load locks whenever the lock is on.
  useEffect(() => {
    alive.current = true;
    void loadLockState()
      .then((s) => {
        if (!alive.current) return;
        setState(s);
        setLocked(shouldLockOnActive(s, Date.now(), true));
      })
      .catch(() => undefined) // an unreadable store must not trap the person on a blank screen
      .then(() => {
        if (alive.current) setReady(true);
      });
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus): void => {
      if (isBiometricPending()) return;
      if (next === 'inactive' || next === 'background') {
        setCoverVisible(true);
        if (!wentAway.current) {
          wentAway.current = true;
          marking.current = markBackgrounded(Date.now()).catch(() => undefined);
        }
        return;
      }
      if (next !== 'active') return;
      setCoverVisible(false);
      if (!wentAway.current) return;
      wentAway.current = false;
      void marking.current.then(() => loadLockState()).then((s) => {
        if (!alive.current) return;
        setState(s);
        if (shouldLockOnActive(s, Date.now(), false)) setLocked(true);
      });
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const unlock = useCallback(() => setLocked(false), []);

  const refresh = useCallback(async () => {
    const s = await loadLockState();
    if (!alive.current) return;
    setState(s);
    setLocked((was) => was && s.settings.enabled);
  }, []);

  return { ready, locked, coverVisible, state, unlock, refresh };
}
