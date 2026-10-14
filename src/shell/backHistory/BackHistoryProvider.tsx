// D-05/D-06/D-07/D-22: observes Expo Router's navigation state and keeps the one app-wide 8-deep
// history. It is the ONLY writer: every change (tab tap, detail push, native or SwipeBack pop,
// programmatic dismissal, our own goBack) is recorded by observing the resulting state. goBack only
// navigates and marks the next observed change as a back step (pendingBack). SwipeBack keeps calling
// router.back(); the history observes that pop.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { router, usePathname, useRootNavigationState, type Href } from 'expo-router';
import { HOME_TAB, type TabId } from '@/shell/tabBar/tabs';
import {
  MAX_HISTORY,
  applyTransition,
  decideBack,
  sameLocation,
  type Location,
} from './backHistoryReducer';
import { locationFromNavState, type NavStateLike } from './navLocation';

export interface BackHistoryContextValue {
  history: readonly Location[];
  current: Location | null;
  canGoBack: boolean; // history.length > 0 (prototype canBack)
  goBack(): boolean; // false only when the system should exit (D-06 step 4)
  registerTabSwitcher(fn: ((tab: TabId) => void) | null): void;
}

export const BackHistoryContext = createContext<BackHistoryContextValue | null>(null);

export function BackHistoryProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const navState = useRootNavigationState();
  const pathname = usePathname();
  const current = useMemo(
    () => locationFromNavState(navState as unknown as NavStateLike, pathname),
    [navState, pathname],
  );

  const [history, setHistory] = useState<readonly Location[]>([]);
  const historyRef = useRef<readonly Location[]>(history);
  const currentRef = useRef<Location | null>(current);
  const prevRef = useRef<Location | null>(null);
  const pendingBackRef = useRef(false);
  const switcherRef = useRef<((tab: TabId) => void) | null>(null);
  // Kept in sync after commit (declared before the observing effect so it runs first).
  useEffect(() => {
    historyRef.current = history;
    currentRef.current = current;
  }, [history, current]);

  useEffect(() => {
    if (current === null) return;
    const prev = prevRef.current;
    if (prev !== null && sameLocation(prev, current)) return;
    const pending = pendingBackRef.current;
    setHistory((h) => applyTransition(h, prev, current, pending));
    pendingBackRef.current = false;
    prevRef.current = current;
  }, [current]);

  const goBack = useCallback((): boolean => {
    let h = historyRef.current;
    const commit = (next: readonly Location[]): void => {
      if (next !== historyRef.current) {
        historyRef.current = next;
        setHistory(next);
      }
    };
    // T-03-06-03: bounded so a run of stale entries can never spin.
    for (let i = 0; i < MAX_HISTORY + 1; i++) {
      const action = decideBack(currentRef.current, h, HOME_TAB);
      if (action.type === 'discardEntry') {
        h = h.slice(0, -1);
        continue;
      }
      commit(h);
      if (action.type === 'stackBack') {
        if (!router.canGoBack()) return false;
        pendingBackRef.current = true;
        router.back();
        return true;
      }
      if (action.type === 'switchTab') {
        pendingBackRef.current = true;
        if (switcherRef.current) switcherRef.current(action.tab as TabId);
        else router.navigate(('/' + action.tab) as Href);
        return true;
      }
      return false;
    }
    commit(h);
    return false;
  }, []);

  const registerTabSwitcher = useCallback((fn: ((tab: TabId) => void) | null): void => {
    switcherRef.current = fn;
  }, []);

  const value = useMemo<BackHistoryContextValue>(
    () => ({ history, current, canGoBack: history.length > 0, goBack, registerTabSwitcher }),
    [history, current, goBack, registerTabSwitcher],
  );

  return <BackHistoryContext.Provider value={value}>{children}</BackHistoryContext.Provider>;
}

export function useBackHistory(): BackHistoryContextValue {
  const ctx = useContext(BackHistoryContext);
  if (!ctx) throw new Error('useBackHistory must be used within a BackHistoryProvider');
  return ctx;
}
