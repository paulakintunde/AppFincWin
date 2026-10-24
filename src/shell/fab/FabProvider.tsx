// D-09/D-10/D-11: the FAB's registration surface. Screens register what the button does; feature
// phases register the app-wide default action and the quick-menu entries as they ship (Record:
// default 'new transaction', Add expense/income, Transfer, Import statement in 03-15; Decide:
// 'New check' in Phase 5). An entry with no handler does not appear (D-02 availability idea).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFocusEffect, useSegments } from 'expo-router';
import { addBreadcrumb } from '@sentry/react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { mountedSheetCount, noteVisible, prune, useSheetCount } from '@/state/sheetStack';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { fabSurface, shouldHideFab, type FabHideReason } from './shouldHideFab';
import { availableQuickActions, type QuickActionId } from './quickActions';

export interface FabConfig {
  label: string;
  accessibilityLabel: string;
  onPress(): void;
}

export interface QuickActionEntry {
  id: QuickActionId;
  label: string;
  run(): void;
}

export interface FabContextValue {
  config: FabConfig | null;
  hidden: boolean;
  quickActions: readonly QuickActionEntry[];
  quickMenuOpen: boolean;
  openQuickMenu(): void;
  closeQuickMenu(): void;
  setScreenFab(config: FabConfig | null): void;
  /** 05-117 (R17.13 M1): a focused screen that wants no FAB at all (not even the app-wide default). Returns the release. */
  suppressDefaultFab(): () => void;
  /** Clears the screen config only if it is still `config` (L8: never the next screen's). */
  clearScreenFab(config: FabConfig): void;
  setDefaultAction(fn: (() => void) | null): void;
  setQuickAction(id: QuickActionId, fn: (() => void) | null): void;
  /** Reference-counted; returns a release function. */
  holdHide(reason: FabHideReason): () => void;
}

const FabContext = createContext<FabContextValue | null>(null);

export function FabProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { current } = useBackHistory();
  const sheetOpen = useSheetCount() > 0;
  const segments = useSegments();

  const [screenConfig, setScreenConfig] = useState<FabConfig | null>(null);
  // Functions held in state need the wrapper form so React does not call them as updaters.
  const [defaultAction, setDefaultActionState] = useState<{ fn: () => void } | null>(null);
  const [quickFns, setQuickFns] = useState<Partial<Record<QuickActionId, () => void>>>({});
  const [holds, setHolds] = useState<readonly FabHideReason[]>([]);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [suppressions, setSuppressions] = useState(0);

  const suppressDefaultFab = useCallback((): (() => void) => {
    setSuppressions((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setSuppressions((n) => Math.max(0, n - 1));
    };
  }, []);
  const setScreenFab = useCallback((c: FabConfig | null): void => setScreenConfig(c), []);
  const clearScreenFab = useCallback(
    (c: FabConfig): void => setScreenConfig((prev) => (prev === c ? null : prev)),
    [],
  );
  const setDefaultAction = useCallback(
    (fn: (() => void) | null): void => setDefaultActionState(fn ? { fn } : null),
    [],
  );
  const setQuickAction = useCallback((id: QuickActionId, fn: (() => void) | null): void => {
    setQuickFns((prev) => {
      const next = { ...prev };
      if (fn) next[id] = fn;
      else delete next[id];
      return next;
    });
  }, []);
  const holdHide = useCallback((reason: FabHideReason): (() => void) => {
    setHolds((prev) => [...prev, reason]);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds((prev) => {
        const i = prev.indexOf(reason);
        if (i < 0) return prev;
        return [...prev.slice(0, i), ...prev.slice(i + 1)];
      });
    };
  }, []);
  const openQuickMenu = useCallback((): void => setQuickMenuOpen(true), []);
  const closeQuickMenu = useCallback((): void => setQuickMenuOpen(false), []);

  const surface = fabSurface(current, segments);
  const onTabRoot = surface === 'tabRoot';

  // D-85 / R16.1 watchdog: on tab-root focus and every 2 s while focused, drop ids whose sheet is
  // not mounted, and clear a stack that has had nothing visible for over 1 s. Only store calls here.
  useEffect(() => {
    if (!onTabRoot) return undefined;
    const tick = (): void => {
      const now = Date.now();
      const dropped = prune(now);
      const cleared = noteVisible(now, mountedSheetCount() > 0);
      if (dropped + cleared > 0) {
        // Counts only: never sheet ids or names.
        addBreadcrumb({
          category: 'sheetStack',
          message: 'sheet stack watchdog',
          data: { dropped, cleared },
        });
      }
    };
    tick();
    const handle = setInterval(tick, 2000);
    return () => clearInterval(handle);
  }, [onTabRoot]);

  const defaultFn = defaultAction?.fn ?? null;
  const labelAdd = t('shell.fab.add');
  const labelAddA11y = t('shell.fab.addA11y');
  const config = useMemo<FabConfig | null>(() => {
    if (screenConfig) return screenConfig;
    if (suppressions > 0) return null;
    if (defaultFn) return { label: labelAdd, accessibilityLabel: labelAddA11y, onPress: defaultFn };
    return null;
  }, [screenConfig, suppressions, defaultFn, labelAdd, labelAddA11y]);

  const hidden = shouldHideFab({
    signedIn: status === 'signedIn',
    surface,
    sheetOpen,
    hideReasons: holds,
    hasAction: config !== null,
  });

  const registeredIds = Object.keys(quickFns).sort().join(',');
  const quickActions = useMemo<readonly QuickActionEntry[]>(() => {
    const ids = registeredIds === '' ? [] : (registeredIds.split(',') as QuickActionId[]);
    return availableQuickActions(ids).map((id) => ({
      id,
      label: t(`shell.quick.${id}`),
      run: () => quickFns[id]?.(),
    }));
    // quickFns identity changes whenever a handler changes, so it is the right dependency.
  }, [quickFns, registeredIds, t]);

  const value = useMemo<FabContextValue>(
    () => ({
      config,
      hidden,
      quickActions,
      quickMenuOpen,
      openQuickMenu,
      closeQuickMenu,
      setScreenFab,
      suppressDefaultFab,
      clearScreenFab,
      setDefaultAction,
      setQuickAction,
      holdHide,
    }),
    [
      config,
      hidden,
      quickActions,
      quickMenuOpen,
      openQuickMenu,
      closeQuickMenu,
      setScreenFab,
      suppressDefaultFab,
      clearScreenFab,
      setDefaultAction,
      setQuickAction,
      holdHide,
    ],
  );

  return <FabContext.Provider value={value}>{children}</FabContext.Provider>;
}

export function useFab(): FabContextValue {
  const ctx = useContext(FabContext);
  if (!ctx) throw new Error('useFab must be used within a FabProvider');
  return ctx;
}

/**
 * A focused screen overrides the default; blur clears only this screen's own config (T-03-07-02).
 * `null` is an active "no FAB here" (05-117, R17.13 M1): the app-wide default Add button is held back while focused.
 */
export function useRegisterFab(config: FabConfig | null): void {
  const { setScreenFab, clearScreenFab, suppressDefaultFab } = useFab();
  const onPressRef = useRef<(() => void) | null>(config ? config.onPress : null);
  useEffect(() => {
    onPressRef.current = config ? config.onPress : null;
  }, [config]);
  const present = config !== null;
  const label = config?.label ?? '';
  const accessibilityLabel = config?.accessibilityLabel ?? '';
  useFocusEffect(
    useCallback(() => {
      if (!present) return suppressDefaultFab();
      const mine: FabConfig = {
        label,
        accessibilityLabel,
        onPress: () => onPressRef.current?.(),
      };
      setScreenFab(mine);
      return () => clearScreenFab(mine);
    }, [present, label, accessibilityLabel, setScreenFab, clearScreenFab, suppressDefaultFab]),
  );
}

export function useProvideDefaultFabAction(fn: (() => void) | null): void {
  const { setDefaultAction } = useFab();
  useEffect(() => {
    setDefaultAction(fn);
    return () => setDefaultAction(null);
  }, [fn, setDefaultAction]);
}

export function useProvideQuickAction(id: QuickActionId, fn: (() => void) | null): void {
  const { setQuickAction } = useFab();
  useEffect(() => {
    setQuickAction(id, fn);
    return () => setQuickAction(id, null);
  }, [id, fn, setQuickAction]);
}

export function useHideFab(reason: FabHideReason, active: boolean): void {
  const { holdHide } = useFab();
  useEffect(() => (active ? holdHide(reason) : undefined), [reason, active, holdHide]);
}
