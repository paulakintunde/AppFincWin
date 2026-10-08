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
import type { FormatProfile } from '@/engine/statement';
import type { RecurringFreq } from '@/engine/recurring';
import type { CategoryColorKey, SeedCategoryKey } from '@/engine/categorize';
import type { UndoLabelKey, UndoLabelParams, UndoStepStatus } from '@/engine/undo';

export type DbClient = SupabaseClient;

export type RateSource = 'same-currency' | 'frankfurter-v2' | 'open-er-api' | 'custom';

/** D-01: rows the user types by hand default to 'paid'; materialised occurrences start 'pending'. */
export type TransactionStatus = 'pending' | 'paid' | 'skipped';

// D-37: mirrors the DB check in 20260926000200 -- PTYPE list (prototype line 3357).
export const PAYMENT_TYPES = {
  out: ['card', 'bank_transfer', 'direct_debit', 'standing_order', 'cash'],
  in: ['direct_deposit', 'invoice', 'transfer', 'card_payout', 'cash'],
} as const;
export type PaymentType = (typeof PAYMENT_TYPES)['out'][number] | (typeof PAYMENT_TYPES)['in'][number];

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
  // Record (Phase 2): D-01, D-02, D-16, D-30, D-37.
  name: string | null;
  category_id: string | null;
  payment_type: PaymentType | null;
  status: TransactionStatus;
  deleted_at: string | null;
  import_batch_id: string | null;
  recurring_series_id: string | null;
  occurrence_date: string | null;
  updated_by: string | null;
  // Statement import provenance (D-45, D-50, D-54) -- insert-only, never patched.
  raw_amount: string | null;
  raw_balance: string | null;
  external_id: string | null;
  import_format: string | null;
  transfer_id: string | null;
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
  updated_by: string | null;
  // D-48: optional non-negative limits, in the account's own currency's minor units.
  overdraft_limit: number | null;
  credit_limit: number | null;
  version: number;
  created_at: string;
  updated_at: string;
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
  // Record (Phase 2), all optional so an existing caller compiles unchanged.
  name?: string | null;
  category_id?: string | null;
  payment_type?: PaymentType | null;
  status?: TransactionStatus;
  import_batch_id?: string | null;
  // Statement import provenance (D-45) -- insert-only.
  raw_amount?: string | null;
  raw_balance?: string | null;
  external_id?: string | null;
  import_format?: 'csv' | 'ofx' | null;
  transfer_id?: string | null;
}

// D-45: raw_amount/raw_balance/external_id/import_format are insert-only provenance and are
// deliberately absent here -- assertAllowedKeys catches a provenance edit before the server does.
export type TransactionPatch = Partial<
  Pick<NewTransaction, 'account_id' | 'original_amount' | 'original_currency' | 'local_date' | 'time_zone' | 'note'>
> &
  Partial<{
    name: string | null;
    category_id: string | null;
    payment_type: PaymentType | null;
    status: TransactionStatus;
    deleted_at: string | null;
    transfer_id: string | null;
  }>;

export interface NewAccount {
  id: string;
  household_id: string;
  name: string;
  kind: AccountRow['kind'];
  currency: string;
  opening_balance: number;
  overdraft_limit?: number | null;
  credit_limit?: number | null;
}

export type AccountPatch = Partial<
  Pick<AccountRow, 'name' | 'kind' | 'opening_balance' | 'archived_at' | 'overdraft_limit' | 'credit_limit'>
>;

export interface ImportProfileRow {
  id: string;
  owner_id: string;
  account_id: string;
  layout_signature: string;
  profile: FormatProfile;
  version: number;
  created_at: string;
}
export const IMPORT_PROFILE_COLUMNS = 'id, owner_id, account_id, layout_signature, profile, version, created_at';

export interface CategoryRow {
  id: string;
  owner_id: string;
  builtin_key: SeedCategoryKey | null;
  name: string | null;
  color_key: CategoryColorKey;
  is_system: boolean;
  archived_at: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface NewCategory {
  id: string;
  name: string;
  color_key: CategoryColorKey;
}
export type CategoryPatch = Partial<{ name: string; color_key: CategoryColorKey; archived_at: string | null }>;
export const CATEGORY_COLUMNS =
  'id, owner_id, builtin_key, name, color_key, is_system, archived_at, version, updated_by, created_at, updated_at';

export interface RecurringSeriesRow {
  id: string;
  household_id: string;
  created_by: string | null;
  updated_by: string | null;
  account_id: string;
  name: string;
  amount: number;
  currency: string;
  category_id: string | null;
  payment_type: PaymentType | null;
  freq: RecurringFreq;
  anchor_date: string;
  time_zone: string;
  end_date: string | null;
  occurrence_count: number | null;
  materialised_through: string | null;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
export const RECURRING_SERIES_COLUMNS =
  'id, household_id, created_by, updated_by, account_id, name, amount, currency, category_id, payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, materialised_through, deleted_at, version, created_at, updated_at';

export interface UndoLogRow {
  id: string;
  owner_id: string;
  label_key: UndoLabelKey;
  label_params: UndoLabelParams;
  status: UndoStepStatus;
  refusal: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
}
// ops/touched_ids never fetched for display.
export const UNDO_LOG_COLUMNS = 'id, owner_id, label_key, label_params, status, refusal, created_at, resolved_at';

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
