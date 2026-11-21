// D-16: the tab bar's measured height and the visible toast's height, shared so the FAB and the
// toast position against them instead of guessing.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface ShellLayoutContextValue {
  tabBarHeight: number;
  setTabBarHeight(h: number): void;
  /** 09-24 (UI-SPEC 4): the pinned Sample bar's height above the tab bar; 0 when it is not shown. */
  sampleBarHeight: number;
  setSampleBarHeight(h: number): void;
  toastHeight: number;
  reportToastHeight(h: number | null): void;
}

const ShellLayoutContext = createContext<ShellLayoutContextValue | null>(null);

export function ShellLayoutProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [tabBarHeight, setTabBarHeightState] = useState(0);
  const [toastHeight, setToastHeight] = useState(0);
  const [sampleBarHeight, setSampleBarHeight] = useState(0);

  const setTabBarHeight = useCallback((h: number): void => {
    setTabBarHeightState(h);
  }, []);
  const reportToastHeight = useCallback((h: number | null): void => {
    setToastHeight(h ?? 0);
  }, []);

  const value = useMemo<ShellLayoutContextValue>(
    () => ({ tabBarHeight, setTabBarHeight, sampleBarHeight, setSampleBarHeight, toastHeight, reportToastHeight }),
    [tabBarHeight, setTabBarHeight, sampleBarHeight, toastHeight, reportToastHeight],
  );

  return <ShellLayoutContext.Provider value={value}>{children}</ShellLayoutContext.Provider>;
}

export function useShellLayout(): ShellLayoutContextValue {
  const ctx = useContext(ShellLayoutContext);
  if (!ctx) throw new Error('useShellLayout must be used within a ShellLayoutProvider');
  return ctx;
}
