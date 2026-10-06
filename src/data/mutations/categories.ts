// REC-07, D-34, D-35, D-36: paused-mutation defaults and hooks for creating, renaming,
// recolouring, archiving/restoring and merging categories. Categories are never deleted --
// archive is the only removal, so no transaction row is ever orphaned (D-24, T-02-17-02).
//
// Add / edit / archive are single-row writes that record their own undo step at the moment
// the write succeeds (same pattern as transactions.ts). Merge is one atomic `apply_patches`
// call that moves every active transaction to the target and archives the source, carrying
// its own undo step in the same server transaction (D-WR-03: the step id is the replay key).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { CategoryColorKey } from '@/engine/categorize';
import {
  NOW_SENTINEL,
  buildStep,
  inverseOfInserts,
  inverseOfPatches,
  planBulkPatch,
  type PatchValue,
  type UndoConflict,
  type UndoLabelKey,
  type UndoLabelParams,
} from '@/engine/undo';
import { DbError, VersionConflictError, type WriteEntity } from '@/db/errors';
import { insertCategory, updateCategory } from '@/db/categories';
import { applyPatches } from '@/db/patches';
import { MERGE_LIMIT, fetchActiveIdsByCategory } from '@/db/transactions';
import type { CategoryPatch, CategoryRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type CategoryList = WithPending<CategoryRow>[];

export interface AddCategoryVars {
  ownerId: string;
  row: { id: string; name: string; color_key: CategoryColorKey };
  stepId: string;
}

export interface EditCategoryVars {
  id: string;
  ownerId: string;
  expectedVersion: number;
  patch: CategoryPatch;
  undo: {
    stepId: string;
    labelKey: UndoLabelKey;
    labelParams: UndoLabelParams;
    before: Readonly<Record<string, PatchValue>>;
  };
}

export interface MergeCategoryVars {
  source: CategoryRow;
  target: CategoryRow;
  targetName: string;
  householdId: string;
  ownerId: string;
  stepId: string;
}

function patchCategoriesCache(qc: QueryClient, ownerId: string, updater: (rows: CategoryList) => CategoryList): void {
  qc.setQueryData<CategoryList>(queryKeys.categories(ownerId), (old) => updater(old ?? []));
}

export function registerCategoryMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addCategory, {
    mutationFn: (vars: AddCategoryVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertCategory(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'categoryAdded',
          { name: vars.row.name },
          inverseOfInserts('categories', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddCategoryVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.categories(vars.ownerId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<CategoryRow> = {
        id: vars.row.id,
        owner_id: vars.ownerId,
        builtin_key: null,
        name: vars.row.name,
        color_key: vars.row.color_key,
        is_system: false,
        archived_at: null,
        version: 1,
        updated_by: null,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchCategoriesCache(qc, vars.ownerId, (rows) => [...rows, optimistic]);
    },
    onSuccess: (row: CategoryRow, vars: AddCategoryVars) => {
      patchCategoriesCache(qc, vars.ownerId, (rows) => upsertRow(rows, row, 'end'));
    },
    onError: async (err: unknown, vars: AddCategoryVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchCategoriesCache(qc, vars.ownerId, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'categories',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editCategory, {
    mutationFn: (vars: EditCategoryVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('categories', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateCategory(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<CategoryRow>(err, vars.patch)
        );
        recordWrittenVersion('categories', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.undo.stepId,
          vars.undo.labelKey,
          vars.undo.labelParams,
          inverseOfPatches('categories', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditCategoryVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.categories(vars.ownerId) });
      patchCategoriesCache(qc, vars.ownerId, (rows) =>
        rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: CategoryRow, vars: EditCategoryVars) => {
      patchCategoriesCache(qc, vars.ownerId, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: EditCategoryVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as CategoryRow;
        patchCategoriesCache(qc, vars.ownerId, (rows) => rows.map((r) => (r.id === vars.id ? serverRow : r)));
        await recordFailedWrite({
          entity: 'categories',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: vars.patch,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
        await recordFailedWrite({
          entity: 'categories',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });

  qc.setMutationDefaults(mutationKeys.mergeCategory, {
    mutationFn: (vars: MergeCategoryVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // D-36: ids are read at flush time, so rows added while this sat in the queue move too.
        const rows = await fetchActiveIdsByCategory(client, vars.householdId, vars.source.id);
        if (rows.length > MERGE_LIMIT) throw new DbError('merge too large', 'merge-too-large', null);

        const items = [
          ...rows.map((r) => ({
            entity: 'transactions' as const,
            id: r.id,
            expectedVersion: resolveExpectedVersion('transactions', r.id, r.version),
            before: { category_id: vars.source.id },
            patch: { category_id: vars.target.id },
          })),
          {
            entity: 'categories' as const,
            id: vars.source.id,
            expectedVersion: resolveExpectedVersion('categories', vars.source.id, vars.source.version),
            before: { archived_at: null },
            patch: { archived_at: NOW_SENTINEL },
          },
        ];
        const { forward, inverse } = planBulkPatch(items);
        // D-WR-03: the undo step travels with the call so a replay is recognised as applied.
        const applied = await applyPatches(client, forward, buildStep(vars.stepId, 'categoryMerged', { name: vars.targetName }, inverse));

        const bases = new Map<string, number[]>();
        items.forEach((item, k) => {
          const original = k < rows.length ? rows[k]!.version : vars.source.version;
          bases.set(`${item.entity}\u0000${item.id}`, [original, item.expectedVersion]);
        });
        for (const row of applied) {
          recordWrittenVersion(row.entity as WriteEntity, row.id, bases.get(`${row.entity}\u0000${row.id}`) ?? [], row.version);
        }
        return applied;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: MergeCategoryVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.categories(vars.ownerId) });
      const now = new Date().toISOString();
      patchCategoriesCache(qc, vars.ownerId, (rows) =>
        rows.map((r) => (r.id === vars.source.id ? { ...r, archived_at: now, pending: true } : r))
      );
    },
    onSuccess: (_rows: unknown, vars: MergeCategoryVars) => {
      // Not awaited: query-core holds WRITE_SCOPE while onSuccess is awaited (WR-A15).
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onError: async (err: unknown, vars: MergeCategoryVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });

      if (err instanceof VersionConflictError) {
        const conflict = err.serverRow as UndoConflict;
        await recordFailedWrite({
          entity: conflict.entity,
          entityId: conflict.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: { labelKey: 'categoryMerged' },
        });
        showToast({ kind: 'refusal', refusal: conflict });
        return;
      }

      // Ids only: a rejected merge names its source category, not the rows it would have moved.
      await recordFailedWrite({
        entity: 'categories',
        entityId: vars.source.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { labelKey: 'categoryMerged', targetId: vars.target.id },
      });
    },
  });
}

function assertEditable(row: CategoryRow): void {
  if (row.is_system) throw new TypeError('a system category cannot be edited or archived');
}

export function useAddCategory(): {
  add(input: { ownerId: string; name: string; colorKey: CategoryColorKey }): { id: string; stepId: string };
} {
  const mutation = useMutation<CategoryRow, unknown, AddCategoryVars>({
    mutationKey: mutationKeys.addCategory,
    scope: WRITE_SCOPE,
  });
  return {
    add(input) {
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        row: { id, name: input.name, color_key: input.colorKey },
        stepId,
      });
      return { id, stepId };
    },
  };
}

function useEditMutation() {
  return useMutation<CategoryRow, unknown, EditCategoryVars>({
    mutationKey: mutationKeys.editCategory,
    scope: WRITE_SCOPE,
  });
}

export function useEditCategory(): {
  edit(row: CategoryRow, patch: { name?: string; colorKey?: CategoryColorKey }): string;
} {
  const mutation = useEditMutation();
  return {
    edit(row, patch) {
      assertEditable(row);
      const dbPatch: CategoryPatch = {};
      const before: Record<string, PatchValue> = {};
      if (patch.name !== undefined) {
        dbPatch.name = patch.name;
        before.name = row.name;
      }
      if (patch.colorKey !== undefined) {
        dbPatch.color_key = patch.colorKey;
        before.color_key = row.color_key;
      }
      if (Object.keys(dbPatch).length === 0) throw new RangeError('edit category: nothing to change');
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: row.owner_id,
        expectedVersion: row.version,
        patch: dbPatch,
        undo: { stepId, labelKey: 'categoryEdited', labelParams: { name: patch.name ?? row.name ?? '' }, before },
      });
      return stepId;
    },
  };
}

export function useArchiveCategory(): { archive(row: CategoryRow): string; restore(row: CategoryRow): string } {
  const mutation = useEditMutation();

  function send(row: CategoryRow, archivedAt: string | null, labelKey: UndoLabelKey): string {
    assertEditable(row);
    const stepId = newStepId();
    mutation.mutate({
      id: row.id,
      ownerId: row.owner_id,
      expectedVersion: row.version,
      patch: { archived_at: archivedAt },
      undo: { stepId, labelKey, labelParams: { name: row.name ?? '' }, before: { archived_at: row.archived_at } },
    });
    return stepId;
  }

  return {
    archive: (row) => send(row, new Date().toISOString(), 'categoryArchived'),
    restore: (row) => send(row, null, 'categoryEdited'),
  };
}

export function useMergeCategory(): { merge(vars: Omit<MergeCategoryVars, 'stepId'>): string } {
  const mutation = useMutation<unknown, unknown, MergeCategoryVars>({
    mutationKey: mutationKeys.mergeCategory,
    scope: WRITE_SCOPE,
  });
  return {
    merge(vars) {
      if (vars.source.id === vars.target.id) throw new TypeError('merge: source and target are the same category');
      assertEditable(vars.source);
      if (vars.target.is_system || vars.target.archived_at !== null) {
        throw new TypeError('merge: the target must be an active, non-system category');
      }
      const stepId = newStepId();
      mutation.mutate({ ...vars, stepId });
      return stepId;
    },
  };
}
