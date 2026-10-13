// Typed reads and version-conditional writes for description-to-category rules (REC-27, D-24,
// D-26, D-27). Same shape as src/db/categories.ts: client-injected id, duplicate-id-safe
// insert, version-conditional update.
//
// scope, owner_id, household_id (after insert) and created_by are never patchable, and
// deleted_at is not an insert column -- CATEGORY_RULE_*_KEYS mirror the SQL grants exactly.
// assertAllowedKeys is the offline-capable mirror of that boundary (T-02.3-09-01).

import type { BuiltinCategoryKey } from '@/engine/categorize';
import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export type RuleScope = 'personal' | 'shared';

export interface CategoryRuleRow {
  id: string;
  scope: RuleScope;
  owner_id: string | null;
  household_id: string | null;
  created_by: string | null;
  keyword: string;
  keyword_norm: string;
  category_id: string | null;
  target_builtin_key: BuiltinCategoryKey | null;
  target_name: string | null;
  deleted_at: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_RULE_COLUMNS =
  'id, scope, owner_id, household_id, created_by, keyword, keyword_norm, category_id, target_builtin_key, target_name, deleted_at, version, updated_by, created_at, updated_at';

export interface NewCategoryRule {
  id: string;
  scope: RuleScope;
  household_id: string | null;
  keyword: string;
  keyword_norm: string;
  category_id: string | null;
  target_builtin_key: BuiltinCategoryKey | null;
  target_name: string | null;
}

export type CategoryRulePatch = Partial<
  Pick<CategoryRuleRow, 'keyword' | 'keyword_norm' | 'category_id' | 'target_builtin_key' | 'target_name' | 'deleted_at'>
>;

export const CATEGORY_RULE_INSERT_KEYS = [
  'id',
  'scope',
  'household_id',
  'keyword',
  'keyword_norm',
  'category_id',
  'target_builtin_key',
  'target_name',
] as const satisfies readonly (keyof NewCategoryRule)[];

export const CATEGORY_RULE_PATCH_KEYS = [
  'keyword',
  'keyword_norm',
  'category_id',
  'target_builtin_key',
  'target_name',
  'deleted_at',
] as const satisfies readonly (keyof CategoryRulePatch)[];

const ENTITY = 'category_rules' as const;
const UNIQUE_VIOLATION = '23505';

/** Live rows only (RLS decides which personal and shared rows the caller can see). */
export async function fetchCategoryRules(client: DbClient): Promise<CategoryRuleRow[]> {
  const { data, error, status } = await client
    .from('category_rules')
    .select(CATEGORY_RULE_COLUMNS)
    .is('deleted_at', null)
    .order('keyword_norm', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as CategoryRuleRow[] | null) ?? [];
}

export async function fetchCategoryRule(client: DbClient, id: string): Promise<CategoryRuleRow | null> {
  const { data, error, status } = await client.from('category_rules').select(CATEGORY_RULE_COLUMNS).eq('id', id).maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as CategoryRuleRow | null) ?? null;
}

export async function insertCategoryRule(client: DbClient, rule: NewCategoryRule): Promise<CategoryRuleRow> {
  const row: Record<string, unknown> = {};
  for (const key of CATEGORY_RULE_INSERT_KEYS) {
    if (rule[key] !== undefined) row[key] = rule[key];
  }

  const { data, error, status } = await client.from('category_rules').insert(row).select(CATEGORY_RULE_COLUMNS).single();

  if (!error) return data as CategoryRuleRow;

  // MON-08: a duplicate client id means this exact write already landed (replay).
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchCategoryRule(client, rule.id);
    if (existing) return existing;
    // A duplicate keyword on another id: rethrown as a permanent rejection.
  }

  throw toDbError(error, status);
}

export async function updateCategoryRule(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: CategoryRulePatch
): Promise<CategoryRuleRow> {
  assertAllowedKeys(patch, CATEGORY_RULE_PATCH_KEYS, 'updateCategoryRule');

  const { data, error, status } = await client
    .from('category_rules')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(CATEGORY_RULE_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as CategoryRuleRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as CategoryRuleRow;

  const serverRow = await fetchCategoryRule(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
