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
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { useSheetCount } from '@/state/sheetStack';
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

  const [screenConfig, setScreenConfig] = useState<FabConfig | null>(null);
  // Functions held in state need the wrapper form so React does not call them as updaters.
  const [defaultAction, setDefaultActionState] = useState<{ fn: () => void } | null>(null);
  const [quickFns, setQuickFns] = useState<Partial<Record<QuickActionId, () => void>>>({});
  const [holds, setHolds] = useState<readonly FabHideReason[]>([]);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  const setScreenFab = useCallback((c: FabConfig | null): void => setScreenConfig(c), []);
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

  const defaultFn = defaultAction?.fn ?? null;
  const labelAdd = t('shell.fab.add');
  const labelAddA11y = t('shell.fab.addA11y');
  const config = useMemo<FabConfig | null>(() => {
    if (screenConfig) return screenConfig;
    if (defaultFn) return { label: labelAdd, accessibilityLabel: labelAddA11y, onPress: defaultFn };
    return null;
  }, [screenConfig, defaultFn, labelAdd, labelAddA11y]);

  const hidden = shouldHideFab({
    signedIn: status === 'signedIn',
    surface: fabSurface(current),
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

/** A focused screen overrides the default; blur clears it (T-03-07-02). */
export function useRegisterFab(config: FabConfig | null): void {
  const { setScreenFab } = useFab();
  const onPressRef = useRef<(() => void) | null>(config ? config.onPress : null);
  useEffect(() => {
    onPressRef.current = config ? config.onPress : null;
  }, [config]);
  const present = config !== null;
  const label = config?.label ?? '';
  const accessibilityLabel = config?.accessibilityLabel ?? '';
  useFocusEffect(
    useCallback(() => {
      if (!present) return undefined;
      setScreenFab({
        label,
        accessibilityLabel,
        onPress: () => onPressRef.current?.(),
      });
      return () => setScreenFab(null);
    }, [present, label, accessibilityLabel, setScreenFab]),
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
