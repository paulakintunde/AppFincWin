// REC-27, D-24, D-26: paused-mutation defaults and hooks for adding, editing and removing
// description-to-category rules. Each write records one undo step (ruleAdded / ruleEdited /
// ruleRemoved) at the moment it succeeds. Removal is a soft delete (deleted_at) so Undo can
// restore it. Keyword text is never sent to analytics; failed-write payloads carry the
// attempted patch only for the local failed-writes list.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { RULE_KEYWORD_MAX, normaliseRuleKeyword, sharedTargetFor } from '@/engine/categorize';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue, type UndoLabelParams } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  insertCategoryRule,
  updateCategoryRule,
  type CategoryRulePatch,
  type CategoryRuleRow,
  type NewCategoryRule,
  type RuleScope,
} from '@/db/categoryRules';
import type { CategoryRow } from '@/db/rows';
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
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type RuleList = WithPending<CategoryRuleRow>[];

export interface RuleCacheKey {
  userId: string;
  householdId: string;
}

export interface AddRuleVars {
  ownerId: string;
  cache: RuleCacheKey;
  row: NewCategoryRule;
  stepId: string;
}

export interface EditRuleVars {
  id: string;
  ownerId: string;
  cache: RuleCacheKey;
  expectedVersion: number;
  patch: CategoryRulePatch;
  undo: {
    stepId: string;
    labelKey: 'ruleEdited' | 'ruleRemoved';
    labelParams: UndoLabelParams;
    before: Readonly<Record<string, PatchValue>>;
  };
}

export type RuleCategory = Pick<CategoryRow, 'id' | 'builtin_key' | 'name' | 'is_system'>;

function patchRulesCache(qc: QueryClient, cache: RuleCacheKey, updater: (rows: RuleList) => RuleList): void {
  qc.setQueryData<RuleList>(queryKeys.categoryRules(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

export function registerCategoryRuleMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addRule, {
    mutationFn: (vars: AddRuleVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertCategoryRule(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'ruleAdded',
          { name: vars.row.keyword },
          inverseOfInserts('category_rules', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddRuleVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.categoryRules(vars.cache.userId, vars.cache.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<CategoryRuleRow> = {
        ...vars.row,
        owner_id: vars.row.scope === 'personal' ? vars.ownerId : null,
        created_by: vars.ownerId,
        deleted_at: null,
        version: 1,
        updated_by: null,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchRulesCache(qc, vars.cache, (rows) => [...rows, optimistic]);
    },
    onSuccess: (row: CategoryRuleRow, vars: AddRuleVars) => {
      patchRulesCache(qc, vars.cache, (rows) => upsertRow(rows, row, 'end'));
    },
    onError: async (err: unknown, vars: AddRuleVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchRulesCache(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'category_rules',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { scope: vars.row.scope, category_id: vars.row.category_id },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editRule, {
    mutationFn: (vars: EditRuleVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('category_rules', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateCategoryRule(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<CategoryRuleRow>(err, vars.patch)
        );
        recordWrittenVersion('category_rules', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.undo.stepId,
          vars.undo.labelKey,
          vars.undo.labelParams,
          inverseOfPatches('category_rules', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditRuleVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.categoryRules(vars.cache.userId, vars.cache.householdId) });
      patchRulesCache(qc, vars.cache, (rows) =>
        // A soft delete drops the row from the live list straight away.
        vars.patch.deleted_at
          ? rows.filter((r) => r.id !== vars.id)
          : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: CategoryRuleRow, vars: EditRuleVars) => {
      patchRulesCache(qc, vars.cache, (rows) =>
        row.deleted_at ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))
      );
    },
    onError: async (err: unknown, vars: EditRuleVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as CategoryRuleRow;
        patchRulesCache(qc, vars.cache, (rows) => {
          if (serverRow.deleted_at) return rows.filter((r) => r.id !== vars.id);
          return rows.some((r) => r.id === vars.id) ? rows.map((r) => (r.id === vars.id ? serverRow : r)) : [...rows, serverRow];
        });
        await recordFailedWrite({
          entity: 'category_rules',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: { labelKey: vars.undo.labelKey },
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        void qc.invalidateQueries({ queryKey: queryKeys.categoryRules(vars.cache.userId, vars.cache.householdId) });
        await recordFailedWrite({
          entity: 'category_rules',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: { labelKey: vars.undo.labelKey },
        });
      }
    },
  });
}

interface RuleTargetColumns {
  category_id: string | null;
  target_builtin_key: CategoryRuleRow['target_builtin_key'];
  target_name: string | null;
}

/** D-26: a personal rule names the user's own category id; a shared rule a built-in key or a name. */
function targetColumns(scope: RuleScope, category: RuleCategory): RuleTargetColumns {
  if (category.is_system) throw new TypeError('a rule cannot target a system category');
  if (scope === 'personal') return { category_id: category.id, target_builtin_key: null, target_name: null };
  const target = sharedTargetFor({ builtinKey: category.builtin_key, displayName: category.name ?? '' });
  if (target === null || (target.kind === 'name' && target.name === '')) {
    throw new TypeError('a shared rule needs a built-in or named category');
  }
  if (target.kind === 'builtin') return { category_id: null, target_builtin_key: target.key, target_name: null };
  if (target.kind === 'name') return { category_id: null, target_builtin_key: null, target_name: target.name };
  throw new TypeError('a shared rule cannot target a category id');
}

function checkedKeyword(raw: string): { keyword: string; keyword_norm: string } {
  const keyword = raw.trim();
  const keyword_norm = normaliseRuleKeyword(keyword);
  if (keyword === '' || keyword_norm === '') throw new RangeError('rule keyword is empty');
  if (keyword.length > RULE_KEYWORD_MAX) throw new RangeError(`rule keyword is over ${RULE_KEYWORD_MAX} characters`);
  return { keyword, keyword_norm };
}

export function useAddRule(): {
  add(input: {
    ownerId: string;
    householdId: string;
    scope: RuleScope;
    keyword: string;
    category: RuleCategory;
  }): { id: string; stepId: string };
} {
  const mutation = useMutation<CategoryRuleRow, unknown, AddRuleVars>({
    mutationKey: mutationKeys.addRule,
    scope: WRITE_SCOPE,
  });
  return {
    add(input) {
      const words = checkedKeyword(input.keyword);
      const target = targetColumns(input.scope, input.category);
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: input.householdId },
        row: {
          id,
          scope: input.scope,
          household_id: input.scope === 'shared' ? input.householdId : null,
          ...words,
          ...target,
        },
        stepId,
      });
      return { id, stepId };
    },
  };
}

function useEditMutation() {
  return useMutation<CategoryRuleRow, unknown, EditRuleVars>({
    mutationKey: mutationKeys.editRule,
    scope: WRITE_SCOPE,
  });
}

export function useEditRule(): {
  edit(row: CategoryRuleRow, change: { keyword?: string; category?: RuleCategory }, cache: RuleCacheKey): string;
} {
  const mutation = useEditMutation();
  return {
    edit(row, change, cache) {
      const patch: CategoryRulePatch = {};
      const before: Record<string, PatchValue> = {};
      if (change.keyword !== undefined) {
        const words = checkedKeyword(change.keyword);
        patch.keyword = words.keyword;
        patch.keyword_norm = words.keyword_norm;
        before.keyword = row.keyword;
        before.keyword_norm = row.keyword_norm;
      }
      if (change.category !== undefined) {
        const target = targetColumns(row.scope, change.category);
        Object.assign(patch, target);
        before.category_id = row.category_id;
        before.target_builtin_key = row.target_builtin_key;
        before.target_name = row.target_name;
      }
      if (Object.keys(patch).length === 0) throw new RangeError('edit rule: nothing to change');
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: cache.userId,
        cache,
        expectedVersion: row.version,
        patch,
        undo: { stepId, labelKey: 'ruleEdited', labelParams: { name: patch.keyword ?? row.keyword }, before },
      });
      return stepId;
    },
  };
}

export function useRemoveRule(): { remove(row: CategoryRuleRow, cache: RuleCacheKey): string } {
  const mutation = useEditMutation();
  return {
    remove(row, cache) {
      const stepId = newStepId();
      mutation.mutate({
        id: row.id,
        ownerId: cache.userId,
        cache,
        expectedVersion: row.version,
        patch: { deleted_at: new Date().toISOString() },
        undo: { stepId, labelKey: 'ruleRemoved', labelParams: { name: row.keyword }, before: { deleted_at: null } },
      });
      return stepId;
    },
  };
}
