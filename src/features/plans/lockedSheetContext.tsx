/**
 * 09-16 / 09-25: the one LockedSheet the app shows, and the context write gates open it through. Kept apart from
 * useWriteGate (which reads the plan query and auth) so the light gate (useReadOnlyGate) and screens rendered bare in
 * tests can use it without pulling auth.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setPlanWriteBlockedListener } from '@/data/sync/planWriteGuard';
import { dismissToast, getToast } from '@/state/undoToast';
import { LockedSheet } from './LockedSheet';
import type { LockActionId, LockVariant } from './lockTypes';

export interface LockedSheetOpenState {
  action: LockActionId;
  variant: LockVariant;
}

interface LockedSheetContextValue {
  open: (state: LockedSheetOpenState) => void;
}

const LockedSheetContext = createContext<LockedSheetContextValue | null>(null);

export function LockedSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [last, setLast] = useState<LockedSheetOpenState>({ action: 'addTransaction', variant: 'locked' });
  const open = useCallback((next: LockedSheetOpenState) => {
    setLast(next);
    setVisible(true);
  }, []);
  // 09-25 (A2-W): a write the central guard stopped (no gated button in front of it) opens the same sheet, named
  // generically ("Editing records needs a plan") in the locked variant.
  // The screen that called the write may still show its own "saved" or Undo toast in the same tap: that toast is
  // taken down on the next tick, so nothing claims a change that was not made.
  useEffect(() => {
    setPlanWriteBlockedListener((variant) => {
      const before = getToast()?.id ?? null;
      setTimeout(() => {
        const now = getToast();
        if (now !== null && now.id !== before) dismissToast(now.id);
      }, 0);
      open({ action: 'editRecord', variant });
    });
    return () => setPlanWriteBlockedListener(null);
  }, [open]);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <LockedSheetContext.Provider value={value}>
      {children}
      <LockedSheet visible={visible} action={last.action} variant={last.variant} onClose={() => setVisible(false)} />
    </LockedSheetContext.Provider>
  );
}

/** The opener, or null outside the provider (a gated tap then does nothing, which is still no write). */
export function useLockedSheetOpener(): ((state: LockedSheetOpenState) => void) | null {
  return useContext(LockedSheetContext)?.open ?? null;
}
