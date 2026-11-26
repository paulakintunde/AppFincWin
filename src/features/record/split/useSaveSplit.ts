// 10.1-18 (SPL-01, D-03, D-04): saves or removes a line's category parts through the queued, version-checked mutation, shows
// "Split saved" with Undo, and turns a version conflict into "{name} changed this line." Shared with the receipt flows (10.1-20, 24).
import { useCallback, useEffect, useState } from 'react';
import { VersionConflictError } from '@/db/errors';
import { partsUndoVars, useSetCategoryParts } from '@/data/mutations/categoryParts';
import type { Part } from '@/engine/parts';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import { showToast } from '@/state/undoToast';
import { useT } from '@/i18n';

export interface SaveSplitTarget {
  householdId: string;
  month: string;
  id: string;
  version: number;
}

export interface SaveSplitHandlers {
  /** The change reached the server (or, offline, was queued): the sheet can close. */
  onDone: () => void;
}

export function useSaveSplit(target: SaveSplitTarget) {
  const t = useT();
  const mutation = useSetCategoryParts();
  const label = useMemberLabel(target.householdId);
  const [conflict, setConflict] = useState<string | null>(null);

  const run = useCallback(
    (parts: readonly Part[] | null, keepAs: string | null, { onDone }: SaveSplitHandlers) => {
      setConflict(null);
      const vars = {
        householdId: target.householdId,
        month: target.month,
        id: target.id,
        expectedVersion: target.version,
        parts,
        ...(parts === null ? { keepAs } : {}),
      };
      mutation.mutate(vars, {
        onSuccess: (res) => {
          const undo = partsUndoVars(vars, res);
          showToast({
            kind: 'ordinary',
            text: { key: 'split.saved' },
            onUndo: undo ? () => mutation.mutate(undo) : null,
          });
          onDone();
        },
        onError: (err) => {
          if (err instanceof VersionConflictError) {
            const by = (err.serverRow as { updated_by?: string | null } | null)?.updated_by ?? null;
            setConflict(t('split.versionConflict', { name: label(by) }));
          }
        },
      });
    },
    [mutation, target.householdId, target.month, target.id, target.version, label, t],
  );

  // Offline the write waits in the queue; the sheet does not hold the user until a connection comes back.
  const [queuedDone, setQueuedDone] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (mutation.isPaused && queuedDone) queuedDone();
  }, [mutation.isPaused, queuedDone]);

  const save = useCallback(
    (parts: readonly Part[], handlers: SaveSplitHandlers) => {
      setQueuedDone(() => handlers.onDone);
      run(parts, null, handlers);
    },
    [run],
  );
  const remove = useCallback(
    (keepAs: string | null, handlers: SaveSplitHandlers) => {
      setQueuedDone(() => handlers.onDone);
      run(null, keepAs, handlers);
    },
    [run],
  );

  return { save, remove, pending: mutation.isPending, conflict };
}
