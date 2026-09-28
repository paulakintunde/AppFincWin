// Remembered statement-format profiles (D-42, REC-13): once the user confirms how a
// statement reads (sign convention, balance meaning, any stated limit), it is saved per
// (owner, account, layout signature) so the next file from the same bank is read the same
// way without asking again. `isFormatProfile` is the shape guard on the way both in and out
// -- a stale schema version or a foreign shape (e.g. written by a future app version) is
// never applied; the pipeline just re-derives the reading as if nothing were remembered.
//
// Per-user, not per-household (see the migration's header): owner_id is never sent in a
// write payload -- the column default fills it on insert, and RLS pins every read/write to
// `auth.uid()`. Insert and update are kept as two separate, narrower grants (no merge-on-
// conflict write) since a single combined write would need an update grant on every
// insert-only column (account_id, layout_signature), which the migration deliberately
// withholds.

import type { AccountFamily, FormatProfile, ImportSource } from '@/engine/statement';
import { MAX_LAYOUT_SIGNATURE } from '@/engine/statement';
import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { IMPORT_PROFILE_COLUMNS, type DbClient, type ImportProfileRow } from './rows';

/** Postgres/PostgREST unique-violation code -- a concurrent save racing this one (MON-08 in spirit). */
const UNIQUE_VIOLATION = '23505';

const ENTITY = 'import_profiles' as const;

const SOURCES: readonly ImportSource[] = ['csv', 'ofx'];
const ACCOUNT_FAMILIES: readonly AccountFamily[] = ['deposit', 'card', 'loan'];
const POSITIVE_MEANS: readonly FormatProfile['positiveMeans'][] = ['money-in', 'money-spent'];
const BALANCE_MEANS: readonly FormatProfile['balanceMeans'][] = ['held', 'owed', 'available', 'none'];
const DECIDED_BY: readonly FormatProfile['decidedBy'][] = ['labels', 'reconciliation', 'remembered', 'user'];

/** Every key a valid `FormatProfile` may carry -- nothing else, so a foreign or stale shape is rejected (T-02-13-04). */
const FORMAT_PROFILE_KEYS: readonly (keyof FormatProfile)[] = [
  'version',
  'source',
  'accountFamily',
  'positiveMeans',
  'balanceMeans',
  'statedLimit',
  'decidedBy',
];

/** T-02-13-04: strict shape guard for a remembered `profile` value, read from the DB or about to be written to it. */
export function isFormatProfile(v: unknown): v is FormatProfile {
  if (typeof v !== 'object' || v === null) return false;

  const keys = Object.keys(v);
  if (keys.length !== FORMAT_PROFILE_KEYS.length) return false;
  if (!keys.every((k) => (FORMAT_PROFILE_KEYS as readonly string[]).includes(k))) return false;

  const p = v as Record<string, unknown>;
  return (
    p.version === 1 &&
    (SOURCES as readonly unknown[]).includes(p.source) &&
    (ACCOUNT_FAMILIES as readonly unknown[]).includes(p.accountFamily) &&
    (POSITIVE_MEANS as readonly unknown[]).includes(p.positiveMeans) &&
    (BALANCE_MEANS as readonly unknown[]).includes(p.balanceMeans) &&
    (p.statedLimit === null || (typeof p.statedLimit === 'number' && Number.isSafeInteger(p.statedLimit) && p.statedLimit >= 0)) &&
    (DECIDED_BY as readonly unknown[]).includes(p.decidedBy)
  );
}

/** The raw, unvalidated row at (owner, account, layout signature) -- used internally to decide insert vs. update. */
async function fetchRawRow(client: DbClient, ownerId: string, accountId: string, signature: string): Promise<ImportProfileRow | null> {
  const { data, error, status } = await client
    .from('import_profiles')
    .select(IMPORT_PROFILE_COLUMNS)
    .eq('owner_id', ownerId)
    .eq('account_id', accountId)
    .eq('layout_signature', signature)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as ImportProfileRow | null) ?? null;
}

async function fetchRawRowById(client: DbClient, id: string): Promise<ImportProfileRow | null> {
  const { data, error, status } = await client.from('import_profiles').select(IMPORT_PROFILE_COLUMNS).eq('id', id).maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as ImportProfileRow | null) ?? null;
}

/**
 * D-42/REC-13: the remembered reading for this file layout on this account, or null when
 * absent -- or when present but its `profile` fails `isFormatProfile` (a stale or foreign
 * shape is never applied; the import pipeline re-derives the reading instead).
 */
export async function fetchImportProfile(
  client: DbClient,
  ownerId: string,
  accountId: string,
  signature: string
): Promise<ImportProfileRow | null> {
  const row = await fetchRawRow(client, ownerId, accountId, signature);
  if (!row) return null;
  return isFormatProfile(row.profile) ? row : null;
}

async function updateExisting(client: DbClient, id: string, expectedVersion: number, profile: FormatProfile): Promise<ImportProfileRow> {
  const { data, error, status } = await client
    .from('import_profiles')
    .update({ profile })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(IMPORT_PROFILE_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as ImportProfileRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as ImportProfileRow;

  // Zero rows means either the version moved on since we fetched it (a concurrent
  // confirmation of the same layout landed first -- server copy wins) or the row is gone.
  const serverRow = await fetchRawRowById(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}

/**
 * D-42: confirms a reading for this (owner, account, layout signature). Absent -> inserts
 * `{ id, account_id, layout_signature, profile }` (no `owner_id` -- the column default fills
 * it). Present -> updates `{ profile }` with `eq id`/`eq version` (the row's current
 * version). A `23505` on insert means a concurrent save landed first -- re-fetch and update
 * instead of failing.
 */
export async function saveImportProfile(
  client: DbClient,
  input: { id: string; ownerId: string; accountId: string; signature: string; profile: FormatProfile }
): Promise<ImportProfileRow> {
  if (input.signature.length > MAX_LAYOUT_SIGNATURE) {
    throw new RangeError(`saveImportProfile: signature exceeds ${MAX_LAYOUT_SIGNATURE} chars`);
  }

  const existing = await fetchRawRow(client, input.ownerId, input.accountId, input.signature);
  if (existing) return updateExisting(client, existing.id, existing.version, input.profile);

  const { data, error, status } = await client
    .from('import_profiles')
    .insert({ id: input.id, account_id: input.accountId, layout_signature: input.signature, profile: input.profile })
    .select(IMPORT_PROFILE_COLUMNS)
    .single();

  if (!error) return data as ImportProfileRow;

  if (error.code === UNIQUE_VIOLATION) {
    const raced = await fetchRawRow(client, input.ownerId, input.accountId, input.signature);
    if (raced) return updateExisting(client, raced.id, raced.version, input.profile);
  }

  throw toDbError(error, status);
}
