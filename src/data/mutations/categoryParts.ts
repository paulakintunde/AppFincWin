// 10.1-11 (SPL-01, D-03, D-04): saving a line's category parts. Like the other line writes it waits in the offline queue and
// replays version-checked (Phase 10 D-27: parts are ordinary row writes). The cached line is patched at once; the server's
// before-state comes back so Undo can send it again: the caller (UI plan 10.1-18) builds that call from `before` with
// `partsUndoVars` below.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { fromParts, setCategoryParts, toParts, type PartsSnapshot } from '@/db/categoryParts';
import type { Part } from '@/engine/parts';
import { primaryCategory } from '@/engine/parts';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { handleFailure, patchLine, refreshAfterLineWrite, unwrapRpc } from './householdSharing';
import { writeClient } from './writeClient';

export interface SetCategoryPartsVars {
  householdId: string;
  /** The line's month ('YYYY-MM'), so its cache entry can be patched and refreshed. */
  month: string;
  id: string;
  /** The line's version in the cache when the change was made. */
  expectedVersion: number;
  /** Null removes the split. */
  parts: readonly Part[] | null;
  /** With null parts: the category the line keeps. Without it the line keeps its current one. */
  keepAs?: string | null;
}

export interface SetCategoryPartsResult {
  version: number | null;
  /** The parts and category as they were before this change: what Undo sends back. Null when the server gave none. */
  before: PartsSnapshot | null;
}

/** The call that puts a line's parts back as they were; null when the server gave no before-state or version. */
export function partsUndoVars(
  original: Pick<SetCategoryPartsVars, 'householdId' | 'month' | 'id'>,
  result: SetCategoryPartsResult
): SetCategoryPartsVars | null {
  if (!result.before || result.version === null) return null;
  return {
    householdId: original.householdId,
    month: original.month,
    id: original.id,
    expectedVersion: result.version,
    parts: toParts(result.before.parts),
    keepAs: result.before.category_id,
  };
}

export function registerCategoryPartsDefaults(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.setCategoryParts, {
    mutationFn: (vars: SetCategoryPartsVars) =>
      guardSession(vars, async (): Promise<SetCategoryPartsResult> => {
        const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const ok = unwrapRpc(
          await setCategoryParts(client, { id: vars.id, expectedVersion: expected, parts: vars.parts, keepAs: vars.keepAs }),
          vars.id
        );
        const version = typeof ok.version === 'number' ? ok.version : null;
        if (version !== null) recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], version);
        return { version, before: ok.before ?? null };
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetCategoryPartsVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      if (vars.parts === null) {
        patchLine(qc, vars, { category_parts: null, ...(vars.keepAs ? { category_id: vars.keepAs } : {}) });
      } else {
        patchLine(qc, vars, { category_parts: fromParts(vars.parts), category_id: primaryCategory(vars.parts) });
      }
    },
    onSuccess: (_res: SetCategoryPartsResult, vars: SetCategoryPartsVars) => refreshAfterLineWrite(qc, vars),
    // A version_conflict refusal lands here as a VersionConflictError carrying updated_by (D-14): the month is re-read and the
    // failure is parked for the list, and the caller sees the same error from mutateAsync.
    onError: (err: unknown, vars: SetCategoryPartsVars) => handleFailure(qc, err, vars, vars.id, 'setCategoryParts'),
  });
}

export function useSetCategoryParts() {
  return useMutation<SetCategoryPartsResult, unknown, SetCategoryPartsVars>({
    mutationKey: mutationKeys.setCategoryParts,
    scope: WRITE_SCOPE,
  });
}
