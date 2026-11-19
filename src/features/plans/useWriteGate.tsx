/**
 * 09-16 (TIER-09): the write gate. A write button calls `useWriteGate(action)`; when the plan does not cover writes the
 * button stays in place (the caller adds the lock glyph and `a11ySuffix`) and `run(fn)` opens the LockedSheet instead of
 * running `fn`. Explanation only: the central guard (src/data/sync/planWriteGuard.ts, 09-25) stops the write itself, and
 * the server trigger refuses it regardless (T-09-57).
 */
import { useCallback } from 'react';
import { useT } from '@/i18n';
import { useLockedSheetOpener } from './lockedSheetContext';
import type { LockActionId, LockVariant } from './lockTypes';
import { usePlanState } from './usePlanState';

export type { LockActionId } from './lockTypes';
export { LockedSheetProvider } from './lockedSheetContext';

export interface WriteGate {
  gated: boolean;
  variant: LockVariant | null;
  run: (fn: () => void) => void;
  a11ySuffix: string | null;
}

export function useWriteGate(action: LockActionId): WriteGate {
  const plan = usePlanState();
  const t = useT();
  const openSheet = useLockedSheetOpener();
  // Never gate on a guess: until the first plan_state load answers, the button works (the server still decides).
  const gated = !plan.writable && !plan.loading;
  const variant: LockVariant | null = gated ? (plan.status === 'sample' ? 'sample' : 'locked') : null;
  const run = useCallback(
    (fn: () => void) => {
      if (!gated || variant === null) {
        fn();
        return;
      }
      openSheet?.({ action, variant });
    },
    [gated, variant, openSheet, action],
  );
  return { gated, variant, run, a11ySuffix: gated ? t('lock.accessibleSuffix') : null };
}
