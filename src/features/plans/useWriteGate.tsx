/**
 * 09-16 (TIER-09): the write gate. A write button calls `useWriteGate(action)`; when the plan does not cover writes the
 * button stays in place (the caller adds the lock glyph and `a11ySuffix`) and `run(fn)` opens the LockedSheet instead of
 * running `fn`. Cosmetic: the server trigger refuses the write regardless (T-09-57).
 */
import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { LockedSheet } from './LockedSheet';
import type { LockActionId, LockVariant } from './lockTypes';
import { usePlanState } from './usePlanState';

export type { LockActionId } from './lockTypes';

interface OpenState {
  action: LockActionId;
  variant: LockVariant;
}

interface LockedSheetContextValue {
  open: (state: OpenState) => void;
}

const LockedSheetContext = createContext<LockedSheetContextValue | null>(null);

export function LockedSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [last, setLast] = useState<OpenState>({ action: 'addTransaction', variant: 'locked' });
  const open = useCallback((next: OpenState) => {
    setLast(next);
    setVisible(true);
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <LockedSheetContext.Provider value={value}>
      {children}
      <LockedSheet visible={visible} action={last.action} variant={last.variant} onClose={() => setVisible(false)} />
    </LockedSheetContext.Provider>
  );
}

export function useWriteGate(action: LockActionId): {
  gated: boolean;
  variant: LockVariant | null;
  run: (fn: () => void) => void;
  a11ySuffix: string | null;
} {
  const plan = usePlanState();
  const t = useT();
  const ctx = useContext(LockedSheetContext);
  // Never gate on a guess: until the first plan_state load answers, the button works (the server still decides).
  const gated = !plan.writable && !plan.loading;
  const variant: LockVariant | null = gated ? (plan.status === 'sample' ? 'sample' : 'locked') : null;
  const run = useCallback(
    (fn: () => void) => {
      if (!gated || variant === null) {
        fn();
        return;
      }
      ctx?.open({ action, variant });
    },
    [gated, variant, ctx, action],
  );
  return { gated, variant, run, a11ySuffix: gated ? t('lock.accessibleSuffix') : null };
}
