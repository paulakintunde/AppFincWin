/**
 * 09-25 (A2-W): the light write gate for the read-only sweep. Same contract as useWriteGate (gated, variant, run,
 * a11ySuffix) but it reads the plan snapshot the central guard uses (published by LockHost), not the plan query, so a
 * screen can carry the lock mark without importing auth. Outside the app (tests that publish nothing) it never gates.
 *
 * `useReadOnly()` is the bare flag for hiding setup prompts that only lead to writes.
 */
import { useCallback } from 'react';
import { planLockVariant, usePlanWriteState } from '@/data/sync/planWriteGuard';
import { useT } from '@/i18n';
import { useLockedSheetOpener } from './lockedSheetContext';
import type { LockActionId } from './lockTypes';
import type { WriteGate } from './useWriteGate';

export function useReadOnly(): boolean {
  return planLockVariant(usePlanWriteState()) !== null;
}

export function useReadOnlyGate(action: LockActionId = 'editRecord'): WriteGate {
  const t = useT();
  const variant = planLockVariant(usePlanWriteState());
  const openSheet = useLockedSheetOpener();
  const gated = variant !== null;
  const run = useCallback(
    (fn: () => void) => {
      if (variant === null) {
        fn();
        return;
      }
      openSheet?.({ action, variant });
    },
    [variant, openSheet, action],
  );
  return { gated, variant, run, a11ySuffix: gated ? t('lock.accessibleSuffix') : null };
}

/**
 * A write control inside a sheet: when read-only the sheet closes first, then the locked sheet opens (one sheet at a time).
 * `guard(fn)` returns the press handler; `label(text)` adds the spoken "needs a plan".
 */
export function useSheetWriteGate(
  onClose: () => void,
  action: LockActionId = 'editRecord',
): WriteGate & { guard: (fn: () => void) => () => void; label: (text: string) => string } {
  const gate = useReadOnlyGate(action);
  const { gated, run, a11ySuffix } = gate;
  const guard = useCallback(
    (fn: () => void) => () => {
      if (!gated) {
        fn();
        return;
      }
      onClose();
      run(() => undefined);
    },
    [gated, run, onClose],
  );
  const label = useCallback((text: string) => (a11ySuffix ? `${text}, ${a11ySuffix}` : text), [a11ySuffix]);
  return { ...gate, guard, label };
}
