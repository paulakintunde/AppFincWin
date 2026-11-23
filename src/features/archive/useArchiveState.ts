// 10-16 (D-13, D-15, D-16, DAT-01): the person's own archived months, for the month switcher (and Activity search, 10-24).
// A view-layer filter only: no money-answer module may import this (archiveImportGuard.test.ts). Archive is personal, so it
// reads the signed-in person's own archived_months, never the household's. Below level 4, or with the switch off, nothing
// is archived as far as the screen knows, so archived months show normally.
import { useMemo } from 'react';
import { useArchivedMonths } from '@/data/queries/archivedMonths';
import { useArchiveMonth, useRestoreMonth } from '@/data/mutations/archivedMonths';
import { archivedCount } from '@/engine/archive';
import { useAuth } from '@/features/auth/AuthProvider';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { usePlanState } from '@/features/plans/usePlanState';

const NONE: ReadonlySet<string> = new Set<string>();

export interface ArchiveState {
  enabled: boolean;
  archived: ReadonlySet<string>;
  count: number;
  /** The person shares a household, so partners still see an archived month (D-15). */
  shared: boolean;
  archive(month: string): void;
  restore(month: string): void;
}

export function useArchiveState(): ArchiveState {
  const { user } = useAuth();
  const userId = user?.id;
  const access = useFeatureAccess('archive');
  const shared = usePlanState().members >= 2;
  const months = useArchivedMonths(userId).data;
  const { archiveMonth } = useArchiveMonth();
  const { restoreMonth } = useRestoreMonth();
  const enabled = access.on;
  const archived = useMemo<ReadonlySet<string>>(() => (enabled && months ? new Set(months) : NONE), [enabled, months]);
  return {
    enabled,
    archived,
    count: archivedCount(archived),
    shared,
    archive: (month) => {
      if (userId) archiveMonth({ userId, month });
    },
    restore: (month) => {
      if (userId) restoreMonth({ userId, month });
    },
  };
}
