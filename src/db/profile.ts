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

/**
 * W6-13 WR-07: sets home_currency only while the row still holds `expected` (the server default),
 * as one conditional UPDATE -- so an explicit choice made on another device, even between the
 * caller's read and this write, always wins. Returns the updated row, or null when nothing
 * matched (the currency had already been changed).
 */
export async function setHomeCurrencyIfStill(
  client: DbClient,
  userId: string,
  target: string,
  expected: string
): Promise<MoneyPrefsRow | null> {
  const { data, error, status } = await client
    .from('profiles')
    .update({ home_currency: target })
    .eq('id', userId)
    .eq('home_currency', expected)
    .select(MONEY_PREFS_COLUMNS)
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
