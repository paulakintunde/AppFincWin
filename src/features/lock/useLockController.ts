// 10-21 (D-02, D-04, Pitfall 8): owns the AppState subscription for the phone lock and the app-switcher cover.
//  - 'inactive' or 'background': the cover goes up at once and the time is stored (once per trip to the background).
//  - 'active': the cover comes down; the lock goes up when the chosen time has passed (or on a cold start).
//  - While the system biometric prompt is open the app is "inactive" by the OS's doing, so AppState is ignored.
// 10-review (L-1): on 'active' the lock is decided at once from the settings in memory and the time away kept in a ref,
// in the same render as the cover coming down, so the app never shows for a moment before the lock screen. The store
// is read afterwards only to confirm (settings changed elsewhere, or a lock the memory did not know about).
// 10-review (L-3): when the secure store cannot be read, the settings alone (AsyncStorage) decide: a lock that is on
// shows the lock screen (fail closed); a lock that is off keeps today's behaviour, so nobody is trapped.
// 10-review (L-6): a system screen the app opened (picker, share sheet, permission dialog) does not lock on return,
// unless the person stayed away longer than both the chosen time and EXTERNAL_ACTIVITY_MAX_MS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isBiometricPending } from '@/services/lock/biometric';
import { EXTERNAL_ACTIVITY_MAX_MS, isExternalActivityPending } from '@/services/lock/externalActivity';
import {
  loadLockState,
  markBackgrounded,
  readLockSettings,
  shouldLockOnActive,
  type LockState,
} from '@/services/lock/lockStore';
import { LOCK_TIMING_MS } from '@/services/lock/pin';
import { setSecureWindow } from '@/services/lock/secureWindow';

export interface LockController {
  ready: boolean;
  locked: boolean;
  coverVisible: boolean;
  state: LockState | null;
  unlock: () => void;
  refresh: () => Promise<void>;
}

/**
 * 10-review (L-3): the full state when the secure store answers; otherwise the settings alone with no recorded time
 * away (so a lock that is on locks); null only when even the settings cannot be read.
 */
export async function loadLockStateSafe(): Promise<LockState | null> {
  try {
    return await loadLockState();
  } catch {
    try {
      const settings = await readLockSettings();
      return { settings, hasPin: false, wrongTries: 0, lockUntil: null, backgroundedAt: null };
    } catch {
      return null;
    }
  }
}

/** 10-review (L-1, L-5, L-6): the synchronous decision on return, from memory. Pure, so it is tested on its own. */
export function lockOnReturn(s: LockState, awayAt: number, now: number, external: boolean): boolean {
  if (!s.settings.enabled) return false;
  const lock = shouldLockOnActive({ ...s, backgroundedAt: awayAt }, now, false);
  if (!external || !lock) return lock;
  // A screen the app opened itself: forgiven unless the person stayed away longer than the safety cap too.
  const away = now - awayAt;
  return away < 0 || away >= Math.max(LOCK_TIMING_MS[s.settings.timing], EXTERNAL_ACTIVITY_MAX_MS);
}

export function useLockController(): LockController {
  const [state, setState] = useState<LockState | null>(null);
  const [locked, setLocked] = useState(false);
  const [coverVisible, setCoverVisible] = useState(false);
  const [ready, setReady] = useState(false);
  // The latest state, readable synchronously from the AppState handler.
  const stateRef = useRef<LockState | null>(null);
  // When the current trip away began (null when not away), and whether it began with a system screen the app opened.
  const awayAt = useRef<number | null>(null);
  const awayExternal = useRef(false);
  const marking = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  const keep = useCallback((s: LockState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // 10-30 (D-04, owner 2026-11-27): with the lock on, the Android window is secure, so the live recents card is blank.
  const lockOn = state?.settings.enabled === true;
  useEffect(() => {
    void setSecureWindow(lockOn);
  }, [lockOn]);

  // A restored process counts as a cold start (UI-SPEC 1d): the first load locks whenever the lock is on.
  useEffect(() => {
    alive.current = true;
    void loadLockStateSafe().then((s) => {
      if (!alive.current) return;
      if (s !== null) {
        keep(s);
        setLocked(shouldLockOnActive(s, Date.now(), true));
      }
      // Nothing readable at all: open rather than trap the person on a blank screen.
      setReady(true);
    });
    return () => {
      alive.current = false;
    };
  }, [keep]);

  useEffect(() => {
    const onChange = (next: AppStateStatus): void => {
      if (isBiometricPending()) return;
      if (next === 'inactive' || next === 'background') {
        setCoverVisible(true);
        if (awayAt.current === null) {
          const now = Date.now();
          awayAt.current = now;
          awayExternal.current = isExternalActivityPending();
          marking.current = markBackgrounded(now).catch(() => undefined);
        }
        return;
      }
      if (next !== 'active') return;
      const since = awayAt.current;
      if (since === null) {
        setCoverVisible(false);
        return;
      }
      awayAt.current = null;
      const external = awayExternal.current || isExternalActivityPending();
      awayExternal.current = false;
      const now = Date.now();
      const known = stateRef.current;
      if (known !== null) {
        // Same batch: the lock (if due) and the cover coming down render together.
        if (lockOnReturn(known, since, now, external)) setLocked(true);
        setCoverVisible(false);
      }
      // Confirm from the store. With nothing in memory yet the cover stays up until this answers.
      void marking.current
        .then(() => loadLockStateSafe())
        .then((s) => {
          if (!alive.current) return;
          if (s !== null) {
            keep(s);
            if (lockOnReturn(s, since, now, external)) setLocked(true);
          }
          // Gone away again while the store answered: that trip's cover stays up.
          if (awayAt.current === null) setCoverVisible(false);
        });
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [keep]);

  const unlock = useCallback(() => setLocked(false), []);

  const refresh = useCallback(async () => {
    const s = await loadLockStateSafe();
    if (!alive.current || s === null) return;
    keep(s);
    setLocked((was) => was && s.settings.enabled);
  }, [keep]);

  return { ready, locked, coverVisible, state, unlock, refresh };
}
