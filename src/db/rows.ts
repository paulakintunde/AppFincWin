// Row shapes shared by every Phase 1 table/RPC the app reads or writes, plus the one
// generic write-time guard (assertAllowedKeys) every db module uses. Each db module
// (accounts.ts, transactions.ts, ...) owns its own column list and allowed-key constants
// next to the functions that use them; a client payload naming a column outside those
// lists is rejected before any network call -- the grants in SQL are the enforcing
// boundary (T-01-10-01), this is the fast, offline-capable mirror of it.
//
// Every numeric rate column is selected cast to text (`rate::text`) so a rate value
// never has to round-trip through a JS float on its way from Postgres's `numeric` type
// (MON-01) -- callers parse the string themselves via engine/money, never `parseFloat`.

import type { SupabaseClient } from '@supabase/supabase-js';

export type DbClient = SupabaseClient;

export type RateSource = 'same-currency' | 'frankfurter-v2' | 'open-er-api' | 'custom';

export interface TransactionRow {
  id: string;
  household_id: string;
  account_id: string;
  created_by: string | null;
  original_amount: number;
  original_currency: string;
  home_currency: string;
  home_amount: number | null;
  rate: string | null;
  orig_per_eur: string | null;
  home_per_eur: string | null;
  /**
   * RD-03 follow-up: the raw custom-currency stamp behind orig_per_eur/home_per_eur, when
   * that leg resolved through a custom currency -- null for a plain (ISO) leg or a row the
   * server has not yet stamped. Server-written only (the stamp trigger is the sole writer,
   * supabase/migrations/20260924000500_fx_stamping.sql); readable via the table's existing
   * whole-table SELECT grant but absent from every insert/update column-grant list, so it can
   * never be set from a client payload. editStamp's amount-only-edit fallback substitutes
   * these into convertMinorExact instead of the rounded orig_per_eur/home_per_eur (WR-B07).
   */
  orig_custom_unit_value: string | null;
  orig_custom_ref_per_eur: string | null;
  home_custom_unit_value: string | null;
  home_custom_ref_per_eur: string | null;
  rate_date: string | null;
  rate_source: RateSource | null;
  rate_pending: boolean;
  local_date: string;
  time_zone: string;
  note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: string;
  household_id: string;
  created_by: string | null;
  name: string;
  kind: 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';
  currency: string;
  opening_balance: number;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CurrencyRow {
  code: string;
  iso_numeric: string | null;
  name: string;
  symbol: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface FxLatestRow {
  quote: string;
  rate: string;
  rate_date: string;
  source: 'frankfurter-v2' | 'open-er-api';
}

export interface CustomCurrencyRow {
  id: string;
  owner_id: string;
  code: string;
  symbol: string;
  decimals: number;
  reference_currency: string;
  unit_value: string;
  as_of: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MoneyPrefsRow {
  home_currency: string;
  show_cents: boolean;
  lead_figure: 'home' | 'original';
  /** RD-02: explicit in-app region override (ISO 3166-1 alpha-2), or null when unset. */
  region: string | null;
}

export interface NewTransaction {
  id: string;
  household_id: string;
  account_id: string;
  original_amount: number;
  original_currency: string;
  local_date: string;
  time_zone: string;
  note: string | null;
}

export type TransactionPatch = Partial<
  Pick<NewTransaction, 'account_id' | 'original_amount' | 'original_currency' | 'local_date' | 'time_zone' | 'note'>
>;

export interface NewAccount {
  id: string;
  household_id: string;
  name: string;
  kind: AccountRow['kind'];
  currency: string;
  opening_balance: number;
}

export type AccountPatch = Partial<Pick<AccountRow, 'name' | 'kind' | 'opening_balance' | 'archived_at'>>;

// Defined here (not in transactions.ts/accounts.ts) for plan 01-13's custom-currency CRUD to reuse without
// having to duplicate the unit_value::text cast rule.
export const CUSTOM_CURRENCY_COLUMNS =
  'id, owner_id, code, symbol, decimals, reference_currency, unit_value:unit_value::text, as_of, version, created_at, updated_at';

/** Throws before any network call when `patch` names a column outside `allowed`. */
export function assertAllowedKeys(patch: Record<string, unknown>, allowed: readonly string[], context: string): void {
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${context}: "${key}" is not a writable column`);
    }
  }
}
