// Record preferences (ACT-11, ACT-15..17, REC-23, REC-25): week start and the sample-prompt
// marker live on profiles and are written unconditionally (CONTEXT D-11, D-23), like money
// prefs. The horizon is a household setting, read-only here. changeHomeCurrency wraps the
// change_home_currency RPC.

import { DbError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface RecordPrefsRow {
  week_start: 0 | 1 | null;
  sample_prompt_answered_at: string | null;
}

export const RECORD_PREFS_COLUMNS = 'week_start, sample_prompt_answered_at';

// Mirrors the profiles update grant for these columns -- anything else throws before any call.
export const RECORD_PREFS_PATCH_KEYS = [
  'week_start',
  'sample_prompt_answered_at',
] as const satisfies readonly (keyof RecordPrefsRow)[];

export async function fetchRecordPrefs(client: DbClient, userId: string): Promise<RecordPrefsRow | null> {
  const { data, error, status } = await client
    .from('profiles')
    .select(RECORD_PREFS_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as RecordPrefsRow | null) ?? null;
}

export async function updateRecordPrefs(
  client: DbClient,
  userId: string,
  patch: Partial<RecordPrefsRow>
): Promise<RecordPrefsRow> {
  assertAllowedKeys(patch, RECORD_PREFS_PATCH_KEYS, 'updateRecordPrefs');

  const { data, error, status } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(RECORD_PREFS_COLUMNS)
    .single();

  if (error) throw toDbError(error, status);
  return data as RecordPrefsRow;
}

export async function fetchHouseholdHorizon(client: DbClient, householdId: string): Promise<string | null> {
  const { data, error, status } = await client
    .from('households')
    .select('horizon_month')
    .eq('id', householdId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  const value = (data as { horizon_month?: string | null } | null)?.horizon_month;
  return typeof value === 'string' ? value : null;
}

/** change_home_currency could not read exchange rates (P0001, hint 'rates-unavailable'). */
export class RatesUnavailableError extends Error {
  readonly code = 'rates-unavailable';

  constructor() {
    super('Exchange rates are unavailable');
    this.name = 'RatesUnavailableError';
  }
}

export async function changeHomeCurrency(
  client: DbClient,
  args: { next: string; from: string; today: string }
): Promise<{ status: 'applied' | 'unchanged'; capsConverted: number }> {
  const { data, error, status } = await client.rpc('change_home_currency', {
    p_new: args.next,
    p_from: args.from,
    p_today: args.today,
  });

  if (error) {
    const hint = (error as { hint?: string | null }).hint;
    if (error.code === 'P0001' && hint === 'rates-unavailable') throw new RatesUnavailableError();
    if (error.code === '40001') throw new VersionConflictError('profiles', args.from, null);
    throw toDbError(error, status);
  }

  const env = data as { status?: unknown; caps_converted?: unknown } | null;
  if (
    typeof env !== 'object' ||
    env === null ||
    (env.status !== 'applied' && env.status !== 'unchanged') ||
    (env.caps_converted !== undefined && typeof env.caps_converted !== 'number')
  ) {
    throw new DbError('change_home_currency response: malformed envelope', 'bad-response', null);
  }
  return { status: env.status, capsConverted: env.caps_converted ?? 0 };
}
