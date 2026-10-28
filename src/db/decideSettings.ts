// 05-05: per-user Decide settings (05-03). One row per user, unconditional upsert (like recordPrefs).
// DECIDE_SETTINGS_PATCH_KEYS mirror the SQL grant exactly.

import { toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface DecideSettingsRow {
  id: string; // read for Undo (apply_patches); never sent
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
  income_types: string[] | null;
  income_pattern: 'steady' | 'variable' | 'seasonal' | null;
  income_pattern_confirmed: boolean | null;
  variable_method: 'match' | 'spread' | 'steady' | 'balance' | null;
  steady_amount: number | null;
  spread_months: number | null;
  hold_months: 1 | 2 | 3 | null;
  share_pct: number | null;
  detail: 'short' | 'full' | null;
  remind_plan: boolean | null;
  remind_unspent: boolean | null;
  setup_done_at: string | null;
  everyday_override: number | null;
  everyday_override_at: string | null;
  month_marks: Record<string, 'normal' | 'out' | 'half'> | null;
  unspent_anchor: number | null;
  unspent_anchor_at: string | null;
  reserve_account_id: string | null;
  reserve_goal: number | null;
  rough_saving: number | null;
  rough_debt: number | null;
  rough_invest: number | null;
  rough_as_of: string | null;
  unexplained_amount: number | null;
  unexplained_use: 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses' | null;
  unexplained_at: string | null;
  refine_last_at: string | null;
  refine_snooze_until: string | null;
  version: number;
  updated_at: string;
}

export const DECIDE_SETTINGS_COLUMNS =
  'id, user_id, currency, rough_income, rough_spending, reserve, dsr_line, housing_line, unsecured_multiple, investing_floor, saving_floor, basis_override, ' +
  'income_types, income_pattern, income_pattern_confirmed, variable_method, steady_amount, spread_months, hold_months, share_pct, detail, remind_plan, remind_unspent, setup_done_at, everyday_override, everyday_override_at, month_marks, unspent_anchor, unspent_anchor_at, reserve_account_id, reserve_goal, rough_saving, rough_debt, rough_invest, rough_as_of, unexplained_amount, unexplained_use, unexplained_at, refine_last_at, refine_snooze_until, version, updated_at';

export type DecideSettingsPatch = Partial<Omit<DecideSettingsRow, 'id' | 'user_id' | 'version' | 'updated_at'>>;

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
  'income_types',
  'income_pattern',
  'income_pattern_confirmed',
  'variable_method',
  'steady_amount',
  'spread_months',
  'hold_months',
  'share_pct',
  'detail',
  'remind_plan',
  'remind_unspent',
  'setup_done_at',
  'everyday_override',
  'everyday_override_at',
  'month_marks',
  'unspent_anchor',
  'unspent_anchor_at',
  'reserve_account_id',
  'reserve_goal',
  'rough_saving',
  'rough_debt',
  'rough_invest',
  'rough_as_of',
  'unexplained_amount',
  'unexplained_use',
  'unexplained_at',
  'refine_last_at',
  'refine_snooze_until',
] as const satisfies readonly (keyof DecideSettingsPatch)[];

export const EMPTY_DECIDE_SETTINGS: Omit<DecideSettingsRow, 'user_id'> = {
  id: '',
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
  income_types: null,
  income_pattern: null,
  income_pattern_confirmed: null,
  variable_method: null,
  steady_amount: null,
  spread_months: null,
  hold_months: null,
  share_pct: null,
  detail: null,
  remind_plan: null,
  remind_unspent: null,
  setup_done_at: null,
  everyday_override: null,
  everyday_override_at: null,
  month_marks: null,
  unspent_anchor: null,
  unspent_anchor_at: null,
  reserve_account_id: null,
  reserve_goal: null,
  rough_saving: null,
  rough_debt: null,
  rough_invest: null,
  rough_as_of: null,
  unexplained_amount: null,
  unexplained_use: null,
  unexplained_at: null,
  refine_last_at: null,
  refine_snooze_until: null,
  version: 0,
  updated_at: '',
};

/** Rows cached before 05.2 lack the new fields: read them as null, never undefined. */
export function normaliseDecideSettings(raw: Partial<DecideSettingsRow>): DecideSettingsRow {
  return { ...EMPTY_DECIDE_SETTINGS, ...raw } as DecideSettingsRow;
}

export async function fetchDecideSettings(client: DbClient, userId: string): Promise<DecideSettingsRow | null> {
  const { data, error, status } = await client
    .from('decide_settings')
    .select(DECIDE_SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return data ? normaliseDecideSettings(data as Partial<DecideSettingsRow>) : null;
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
  return normaliseDecideSettings(data as unknown as Partial<DecideSettingsRow>);
}
