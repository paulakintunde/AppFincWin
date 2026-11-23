/**
 * 10-07 (DAT-03): the import template for each table is the export's own column list, so a file saved by Export
 * imports again unedited. Pure: no imports from outside engine/. A guard test in src/data keeps every column here
 * inside EXPORT_MANIFEST.
 */

export type DataTable = 'accounts' | 'savings_goals' | 'debts' | 'holdings';

export interface DataCsvSchema {
  table: DataTable;
  required: readonly string[];
  allowed: readonly string[];
  money: readonly string[];
  enums: Readonly<Record<string, readonly string[]>>;
  dates: readonly string[];
  currencyColumn: 'currency';
}

// Server bookkeeping: accepted in the header so an export imports, but ignored. Listed per table because the
// export carries different bookkeeping columns on each (the data-layer guard test checks them against the manifest).
const IGNORED_COMMON = ['household_id', 'deleted_at', 'created_at', 'updated_at'] as const;
const IGNORED: Readonly<Record<DataTable, readonly string[]>> = {
  accounts: [...IGNORED_COMMON, 'created_by', 'tombstone_of'],
  savings_goals: [...IGNORED_COMMON, 'created_by', 'check_id'],
  debts: [...IGNORED_COMMON, 'check_id', 'series_id', 'extra_series_id'],
  holdings: [...IGNORED_COMMON, 'created_by'],
};

const ACCOUNTS_COLS = [
  'id', 'name', 'kind', 'currency', 'opening_balance', 'archived_at', 'overdraft_limit', 'credit_limit', 'use',
  'use_purpose', 'use_envelope_id', 'use_extra_set_aside', 'overdraft_rate', 'interest_rate', 'is_shared',
  'joint_purpose', 'joint_savings_spendable', 'joint_safety_net',
] as const;

const GOALS_COLS = [
  'id', 'name', 'currency', 'target', 'monthly_amount', 'ready_by', 'opening_saved', 'kind', 'done_at', 'bucket',
  'account_id', 'color_key', 'is_safety_net', 'locked', 'protect', 'up_front_only', 'icon', 'net_confirmed_at',
  'decide_may_use',
] as const;

const DEBTS_COLS = [
  'id', 'account_id', 'name', 'kind', 'currency', 'balance', 'apr', 'minimum_payment', 'secured', 'term_months',
  'start_date', 'min_percent', 'min_interest_added', 'min_floor', 'paid_in_full', 'is_housing', 'pays_in_full',
  'paid_off_on', 'due_day', 'started_balance', 'payoff_order', 'payoff_extra',
] as const;

const HOLDINGS_COLS = [
  'id', 'name', 'type', 'currency', 'value', 'value_as_of', 'opening_put_in', 'account_id', 'paid_from_account_id',
  'monthly_amount', 'day', 'rate',
] as const;

export const DATA_CSV_SCHEMAS: Readonly<Record<DataTable, DataCsvSchema>> = {
  accounts: {
    table: 'accounts',
    required: ['name', 'kind', 'currency'],
    allowed: [...ACCOUNTS_COLS, ...IGNORED.accounts],
    money: ['opening_balance', 'overdraft_limit', 'credit_limit'],
    enums: { kind: ['cash', 'checking', 'savings', 'credit', 'investment', 'loan', 'other'] },
    dates: ['archived_at'],
    currencyColumn: 'currency',
  },
  savings_goals: {
    table: 'savings_goals',
    required: ['name', 'currency', 'target'],
    allowed: [...GOALS_COLS, ...IGNORED.savings_goals],
    money: ['target', 'monthly_amount', 'opening_saved'],
    enums: {
      kind: ['wait', 'pot'],
      bucket: ['college', 'house', 'car', 'trip', 'business', 'wedding', 'other'],
    },
    dates: ['ready_by'],
    currencyColumn: 'currency',
  },
  debts: {
    table: 'debts',
    required: ['name', 'kind', 'currency', 'balance'],
    allowed: [...DEBTS_COLS, ...IGNORED.debts],
    money: ['balance', 'minimum_payment', 'min_floor', 'started_balance', 'payoff_extra'],
    enums: { kind: ['loan', 'card', 'other'] },
    dates: ['start_date', 'paid_off_on'],
    currencyColumn: 'currency',
  },
  holdings: {
    table: 'holdings',
    required: ['name', 'type', 'currency', 'value'],
    allowed: [...HOLDINGS_COLS, ...IGNORED.holdings],
    money: ['value', 'opening_put_in', 'monthly_amount'],
    enums: { type: ['brokerage', 'retirement', 'pension', 'crypto', 'other'] },
    dates: ['value_as_of'],
    currencyColumn: 'currency',
  },
};
