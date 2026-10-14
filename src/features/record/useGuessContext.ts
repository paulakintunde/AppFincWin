// REC-27, D-07, D-11, D-25: the one GuessContext every surface (entry sheet, paste, import,
// Rules screen) uses, so the precedence (personal rule, shared rule, learned, keyword,
// income default) is implemented once. A failed or offline rules read degrades to no rules;
// guessing continues with learned names and built-in keywords and never blocks entry.
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useCategoryLookup } from '@/data/queries/categories';
import { useCategoryRules, useCategorisedNames } from '@/data/queries/categoryRules';
import type { CategoryRuleRow } from '@/db/categoryRules';
import type { CategoryRow } from '@/db/rows';
import {
  DEFAULT_KEYWORD_RULES,
  buildLearnedMap,
  resolveRules,
  type GuessContext,
  type MemberCategory,
  type ResolvedRules,
  type StoredRule,
} from '@/engine/categorize';
import { useT } from '@/i18n';
import { categoryName } from './categoryName';
import { useRecordContext } from './useRecordContext';

export function toStoredRule(row: CategoryRuleRow): StoredRule {
  if (row.scope === 'personal') {
    return { id: row.id, scope: 'personal', keywordNorm: row.keyword_norm, target: { kind: 'category', categoryId: row.category_id ?? '' } };
  }
  if (row.target_builtin_key !== null) {
    return { id: row.id, scope: 'shared', keywordNorm: row.keyword_norm, target: { kind: 'builtin', key: row.target_builtin_key } };
  }
  return { id: row.id, scope: 'shared', keywordNorm: row.keyword_norm, target: { kind: 'name', name: row.target_name ?? '' } };
}

export function memberCategoriesOf(rows: readonly CategoryRow[], t: TFunction): MemberCategory[] {
  return rows.map((row) => ({
    id: row.id,
    builtinKey: row.builtin_key,
    displayName: categoryName(row, t),
    active: row.archived_at === null,
    system: row.is_system,
  }));
}

export interface GuessContextState {
  guess: GuessContext;
  rules: CategoryRuleRow[];
  resolved: ResolvedRules;
  memberCategories: MemberCategory[];
  rulesStatus: 'loading' | 'ready' | 'error';
}

export function useGuessContext(): GuessContextState {
  const rc = useRecordContext();
  const t = useT();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const rulesQuery = useCategoryRules(rc.userId ?? undefined, rc.householdId ?? undefined);
  const namesQuery = useCategorisedNames(rc.householdId ?? undefined, rc.userId ?? undefined);

  const rules = useMemo<CategoryRuleRow[]>(() => (rulesQuery.isError ? [] : (rulesQuery.data ?? [])), [rulesQuery.data, rulesQuery.isError]);
  const memberCategories = useMemo(() => memberCategoriesOf(lookup.all, t), [lookup.all, t]);
  const resolved = useMemo(() => resolveRules(rules.map(toStoredRule), memberCategories), [rules, memberCategories]);
  // Learned names may only suggest a category the member can still pick: rules resolve against
  // active, non-system categories, and the learned map must follow the same eligibility.
  const learned = useMemo(() => {
    const eligible = new Set(memberCategories.filter((c) => c.active && !c.system).map((c) => c.id));
    return buildLearnedMap(
      (namesQuery.data ?? [])
        .filter((n) => eligible.has(n.category_id))
        .map((n) => ({ name: n.name, categoryId: n.category_id, updatedAt: n.updated_at }))
    );
  }, [namesQuery.data, memberCategories]);
  const guess = useMemo<GuessContext>(
    () => ({
      keywordRules: DEFAULT_KEYWORD_RULES,
      learned,
      builtinIds: lookup.builtinIds,
      personalRules: resolved.personal,
      sharedRules: resolved.shared,
    }),
    [learned, lookup.builtinIds, resolved]
  );

  const rulesStatus: GuessContextState['rulesStatus'] = rulesQuery.isError ? 'error' : rulesQuery.isSuccess ? 'ready' : 'loading';
  return { guess, rules, resolved, memberCategories, rulesStatus };
}
