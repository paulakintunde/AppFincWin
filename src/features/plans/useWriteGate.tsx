/**
 * 09-16 (TIER-09): the write gate. A write button calls `useWriteGate(action)`; when the plan does not cover writes the
 * button stays in place (the caller adds the lock glyph and `a11ySuffix`) and `run(fn)` opens the LockedSheet instead of
 * running `fn`. Explanation only: the central guard (src/data/sync/planWriteGuard.ts, 09-25) stops the write itself, and
 * the server trigger refuses it regardless (T-09-57).
 */
import { useCallback } from 'react';
import { useArchivedMonthGate } from '@/features/archive/archivedMonthGate';
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
  const archivedScope = useArchivedMonthGate();
  // Never gate on a guess: until the first plan_state load answers, the button works (the server still decides).
  const gated = !plan.writable && !plan.loading;
  const planVariant: LockVariant | null = gated ? (plan.status === 'sample' ? 'sample' : 'locked') : null;
  // 10-24 (D-14): the plan lock keeps precedence; inside an archived month a write explains the restore step instead.
  const archived = planVariant === null && archivedScope !== null;
  const variant: LockVariant | null = planVariant ?? (archived ? 'archived' : null);
  const run = useCallback(
    (fn: () => void) => {
      if (variant === null) {
        fn();
        return;
      }
      if (variant === 'archived') {
        archivedScope?.openRestore();
        return;
      }
      openSheet?.({ action, variant });
    },
    [variant, archivedScope, openSheet, action],
  );
  const a11ySuffix = gated ? t('lock.accessibleSuffix') : archived ? t('system.archive.a11ySuffix') : null;
  return { gated: gated || archived, variant, run, a11ySuffix };
}
