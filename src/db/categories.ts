// Typed category reads and version-conditional writes (REC-07, D-33, MON-08, Phase 1 D-18).
// Same shape as src/db/customCurrencies.ts: categories are the other per-user table in the
// codebase, client-injected id, duplicate-id-safe insert, version-conditional update.
//
// is_system and builtin_key are never client-writable -- the migration's insert/update
// grants exclude them (with check (... and not is_system)), and CATEGORY_PATCH_KEYS below
// mirrors that exactly. assertAllowedKeys is the fast, offline-capable mirror of the SQL
// grant boundary (T-02-12-02): a patch naming either column throws a TypeError before any
// network call, rather than round-tripping to find out the server rejected it.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, CATEGORY_COLUMNS, type CategoryRow, type DbClient, type NewCategory, type CategoryPatch } from './rows';

export type { NewCategory, CategoryPatch } from './rows';

// Mirrors the migration's insert grant: id, name, color_key -- is_system and builtin_key are
// server-only (seeded at provisioning, D-34) and deliberately excluded.
export const CATEGORY_INSERT_KEYS = ['id', 'name', 'color_key'] as const satisfies readonly (keyof NewCategory)[];

// Mirrors the migration's update grant: name, color_key, archived_at -- is_system and
// builtin_key are excluded, so a patch naming either throws before any network call.
export const CATEGORY_PATCH_KEYS = ['name', 'color_key', 'archived_at'] as const satisfies readonly (keyof CategoryPatch)[];

const ENTITY = 'categories' as const;

/** Postgres/PostgREST unique-violation code -- a duplicate client-generated UUID (MON-08). */
const UNIQUE_VIOLATION = '23505';

export async function fetchCategory(client: DbClient, id: string): Promise<CategoryRow | null> {
  const { data, error, status } = await client.from('categories').select(CATEGORY_COLUMNS).eq('id', id).maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as CategoryRow | null) ?? null;
}

export async function fetchCategories(client: DbClient, ownerId: string): Promise<CategoryRow[]> {
  const { data, error, status } = await client
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as CategoryRow[] | null) ?? [];
}

export async function insertCategory(client: DbClient, category: NewCategory): Promise<CategoryRow> {
  const row: Record<string, unknown> = {};
  for (const key of CATEGORY_INSERT_KEYS) row[key] = category[key];

  const { data, error, status } = await client.from('categories').insert(row).select(CATEGORY_COLUMNS).single();

  if (!error) return data as CategoryRow;

  // MON-08: a duplicate client-generated id means this exact write already landed (a retried
  // mutation, or the paused-mutation queue replaying after a flaky first attempt that
  // actually succeeded) -- the existing row is the correct result, not a failure.
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchCategory(client, category.id);
    if (existing) return existing;
    // CR-A03: the violated constraint is not this row's id. Rethrown as a 23505 DbError,
    // which classifyWriteError treats as a permanent rejection so the write is parked in
    // the failed list, never dropped.
  }

  throw toDbError(error, status);
}

export async function updateCategory(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: CategoryPatch
): Promise<CategoryRow> {
  assertAllowedKeys(patch, CATEGORY_PATCH_KEYS, 'updateCategory');

  const { data, error, status } = await client
    .from('categories')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(CATEGORY_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as CategoryRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as CategoryRow;

  // D-18: zero rows back means either the row moved to a different version (a conflicting
  // edit landed first -- VersionConflictError, server copy wins) or it no longer exists at
  // all (NotFoundError). Distinguish by looking the row up again.
  const serverRow = await fetchCategory(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
