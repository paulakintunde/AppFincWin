// Money preference reads/writes on profiles (MON-04, D-01, D-06, D-25). Preferences are
// per-user settings, not shared records -- D-18's version-conditional concurrency exists for
// records (transactions/accounts/custom currencies), not for a user's own settings row. This
// file writes profiles.{home_currency, show_cents, lead_figure} unconditionally, matching how
// Phase 0's useProfile pattern (src/theme/ThemeProvider.tsx's accent/pairing) writes the same
// profiles row.

import { toDbError } from './errors';
import { assertAllowedKeys, type DbClient, type MoneyPrefsRow } from './rows';

export const MONEY_PREFS_COLUMNS = 'home_currency, show_cents, lead_figure, region';

export type MoneyPrefsPatch = Partial<MoneyPrefsRow>;

// Mirrors supabase/migrations/20260924000200_money_prefs.sql's profiles update grant exactly
// -- a payload naming any other column throws a TypeError before any network call.
export const MONEY_PREFS_PATCH_KEYS = [
  'home_currency',
  'show_cents',
  'lead_figure',
  'region',
] as const satisfies readonly (keyof MoneyPrefsRow)[];

export async function fetchMoneyPrefs(client: DbClient, userId: string): Promise<MoneyPrefsRow | null> {
  const { data, error, status } = await client
    .from('profiles')
    .select(MONEY_PREFS_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as MoneyPrefsRow | null) ?? null;
}

export async function updateMoneyPrefs(
  client: DbClient,
  userId: string,
  patch: MoneyPrefsPatch
): Promise<MoneyPrefsRow> {
  assertAllowedKeys(patch, MONEY_PREFS_PATCH_KEYS, 'updateMoneyPrefs');

  const { data, error, status } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(MONEY_PREFS_COLUMNS)
    .single();

  if (error) throw toDbError(error, status);
  return data as MoneyPrefsRow;
}
