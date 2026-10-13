import { DbError, NotFoundError, VersionConflictError } from '../errors';
import {
  CATEGORY_RULE_COLUMNS,
  CATEGORY_RULE_INSERT_KEYS,
  CATEGORY_RULE_PATCH_KEYS,
  fetchCategoryRules,
  insertCategoryRule,
  updateCategoryRule,
  type CategoryRulePatch,
  type CategoryRuleRow,
  type NewCategoryRule,
} from '../categoryRules';
import { createFakeSupabase } from './fakeSupabase';

function ruleRow(overrides: Partial<CategoryRuleRow> = {}): CategoryRuleRow {
  return {
    id: 'r1',
    scope: 'personal',
    owner_id: 'u1',
    household_id: null,
    created_by: 'u1',
    keyword: 'Tesco',
    keyword_norm: 'tesco',
    category_id: 'c1',
    target_builtin_key: null,
    target_name: null,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_RULE: NewCategoryRule = {
  id: 'r1',
  scope: 'personal',
  household_id: null,
  keyword: 'Tesco',
  keyword_norm: 'tesco',
  category_id: 'c1',
  target_builtin_key: null,
  target_name: null,
};

describe('fetchCategoryRules', () => {
  it('selects live rows ordered by keyword_norm', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [ruleRow()], error: null, status: 200 });
    await expect(fetchCategoryRules(client)).resolves.toEqual([ruleRow()]);
    expect(client.calls.find((c) => c.method === 'select')?.args).toEqual([CATEGORY_RULE_COLUMNS]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.find((c) => c.method === 'order')?.args[0]).toBe('keyword_norm');
  });

  it('maps an error to a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '500' }, status: 500 });
    await expect(fetchCategoryRules(client)).rejects.toBeInstanceOf(DbError);
  });
});

describe('insertCategoryRule', () => {
  it('writes only the insert keys', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ruleRow(), error: null, status: 201 });
    await insertCategoryRule(client, { ...NEW_RULE, deleted_at: 'x' } as NewCategoryRule);
    const sent = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([...CATEGORY_RULE_INSERT_KEYS].sort());
  });

  it('returns the existing row on a duplicate id (replay)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: ruleRow(), error: null, status: 200 });
    await expect(insertCategoryRule(client, NEW_RULE)).resolves.toEqual(ruleRow());
  });

  it('rethrows a duplicate keyword on another id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(insertCategoryRule(client, NEW_RULE)).rejects.toBeInstanceOf(DbError);
  });
});

describe('updateCategoryRule', () => {
  it('rejects non-patchable columns before any network call', async () => {
    const client = createFakeSupabase();
    for (const key of ['scope', 'owner_id', 'household_id']) {
      await expect(updateCategoryRule(client, 'r1', 1, { [key]: 'x' } as CategoryRulePatch)).rejects.toBeInstanceOf(TypeError);
    }
    expect(client.calls).toHaveLength(0);
  });

  it('returns the updated row, checking the version', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [ruleRow({ version: 2 })], error: null, status: 200 });
    await expect(updateCategoryRule(client, 'r1', 1, { keyword: 'x' })).resolves.toMatchObject({ version: 2 });
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 1]);
    expect(CATEGORY_RULE_PATCH_KEYS).toContain('deleted_at');
  });

  it('throws VersionConflictError when the row is at another version', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: ruleRow({ version: 5 }), error: null, status: 200 });
    await expect(updateCategoryRule(client, 'r1', 1, { keyword: 'x' })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('throws NotFoundError when the row is gone', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateCategoryRule(client, 'r1', 1, { keyword: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
