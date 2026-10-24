// 05-05: per-user Decide settings (05-03). One row per user, unconditional upsert (like recordPrefs).
// DECIDE_SETTINGS_PATCH_KEYS mirror the SQL grant exactly.

import { toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface DecideSettingsRow {
  user_id: string;
  currency: string | null;
  rough_income: number | null;
  rough_spending: number | null;
  reserve: number | null;
  dsr_line: string | null;
  housing_line: string | null;
  unsecured_multiple: number | null;
  investing_floor: number | null;
  saving_floor: number | null;
  basis_override: 'average' | 'worst' | null;
  version: number;
  updated_at: string;
}

export const DECIDE_SETTINGS_COLUMNS =
  'user_id, currency, rough_income, rough_spending, reserve, dsr_line, housing_line, unsecured_multiple, investing_floor, saving_floor, basis_override, version, updated_at';

export type DecideSettingsPatch = Partial<Omit<DecideSettingsRow, 'user_id' | 'version' | 'updated_at'>>;

export const DECIDE_SETTINGS_PATCH_KEYS = [
  'currency',
  'rough_income',
  'rough_spending',
  'reserve',
  'dsr_line',
  'housing_line',
  'unsecured_multiple',
  'investing_floor',
  'saving_floor',
  'basis_override',
] as const satisfies readonly (keyof DecideSettingsPatch)[];

export const EMPTY_DECIDE_SETTINGS: Omit<DecideSettingsRow, 'user_id'> = {
  currency: null,
  rough_income: null,
  rough_spending: null,
  reserve: null,
  dsr_line: null,
  housing_line: null,
  unsecured_multiple: null,
  investing_floor: null,
  saving_floor: null,
  basis_override: null,
  version: 0,
  updated_at: '',
};

export async function fetchDecideSettings(client: DbClient, userId: string): Promise<DecideSettingsRow | null> {
  const { data, error, status } = await client
    .from('decide_settings')
    .select(DECIDE_SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as DecideSettingsRow | null) ?? null;
}

export async function upsertDecideSettings(
  client: DbClient,
  userId: string,
  patch: DecideSettingsPatch
): Promise<DecideSettingsRow> {
  assertAllowedKeys(patch, DECIDE_SETTINGS_PATCH_KEYS, 'upsertDecideSettings');

  // CR-A01: PostgREST puts every payload column, user_id included, in the ON CONFLICT DO UPDATE SET list
  // (20261021000100 grants UPDATE on user_id for that). The payload is built from the granted keys only, so
  // `seeded` (server-managed: only seed_sample_data sets it) can never be sent, whatever the caller's object holds.
  const payload: Record<string, unknown> = { user_id: userId };
  for (const key of DECIDE_SETTINGS_PATCH_KEYS) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  const { data, error, status } = await client
    .from('decide_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select(DECIDE_SETTINGS_COLUMNS)
    .single();

  if (error) throw toDbError(error, status);
  return data as DecideSettingsRow;
}
