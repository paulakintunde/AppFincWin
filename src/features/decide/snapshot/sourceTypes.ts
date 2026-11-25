// 05.5-19: the input shapes the one snapshot path reads (rows and settings, as the data layer passes them). Moved here from the
// deleted old builder (buildSnapshot.ts); types only, no logic. buildInputs turns these into V3Inputs.
import type { AccountRow, CustomCurrencyRow, FxLatestRow, RecurringSeriesRow, TransactionRow } from '@/db/rows';
import type { CategorySourceIds, PartnerCategoryRef } from '@/data/sharedCategories';

// structurally identical to src/db/* (05-05); 05-12 passes 05-05 rows here, so its typecheck proves they agree
/** The old engine's judge-on choice (device view); kept as a plain string union now the old engine is gone. */
export type Basis = 'average' | 'worst' | 'month';

export interface SettingsSource {
  currency: string | null;
  rough_income: number | null;
  rough_spending: number | null;
  reserve: number | null;
  dsr_line: string | null;
  housing_line: string | null; // D-103 (R18.4): the 28% housing line as a decimal string, parsed like dsr_line and capped at 100
  unsecured_multiple: number | null;
  investing_floor: number | null;
  saving_floor: number | null;
  basis_override: 'average' | 'worst' | null;
}

export interface DebtSource {
  id: string;
  account_id: string | null;
  check_id: string | null;
  series_id: string | null;
  kind: 'loan' | 'card' | 'other';
  currency: string;
  balance: number;
  apr: string | null;
  minimum_payment: number;
  secured: boolean;
  min_percent: string | null;
  min_interest_added: boolean | null;
  min_floor: number | null;
  paid_in_full: boolean;
  is_housing: boolean; // D-103: a loan (never a card) whose minimum counts toward housingMonthly
  due_day?: number | null; // 05.4 FIN-04 (Decide v3 only; the old builder ignores it): day of the month the payment is due
  paid_off_on?: string | null; // local date the debt was paid off (05.2-48); absent or null = still owed
  version: number;
  deleted_at: string | null;
}

// structurally identical to the savings_goals rows (05-122): the pots and Wait goals (D-101). Done and deleted rows are left out by the builder.
export interface GoalSource {
  id: string;
  kind: 'wait' | 'pot';
  check_id: string | null;
  currency: string;
  target: number | null;
  monthly_amount: number | null;
  ready_by: string | null;
  opening_saved: number;
  done_at: string | null;
  deleted_at: string | null;
  account_id?: string | null; // 05.2 D-22: where the envelope's money is held (a stored answer beats the transfer-leg guess)
  bucket?: string | null; // 05.2 D-23: set = a saving bucket carved out of regular saving
  // 06 Grow (read by the connection points in Decide v3 only; the old builder ignores all but is_safety_net). Optional: an old cached row lacks them.
  name?: string;
  is_safety_net?: boolean;
  locked?: boolean;
  protect?: boolean;
  up_front_only?: boolean;
  net_confirmed_at?: string | null;
  decide_may_use?: boolean; // 06.1 D-20: Decide's own unlock for answers; absent = locked
}

// structurally identical to src/db/decideChanges.ts (05-38)
export interface ChangeSource {
  id: string;
  kind: 'income' | 'spending';
  monthly_amount: number;
  currency: string;
  start_month: string;
  end_month: string | null;
  deleted_at: string | null;
}

export type SnapshotRow = Pick<
  TransactionRow,
  | 'id'
  | 'account_id'
  | 'local_date'
  | 'original_amount'
  | 'original_currency'
  | 'home_currency'
  | 'home_amount'
  | 'orig_per_eur'
  | 'status'
  | 'is_refund'
  | 'transfer_id'
  | 'recurring_series_id'
  | 'category_id'
  | 'deleted_at'
> & { one_off?: boolean | null; goal_id?: string | null; debt_id?: string | null; import_batch_id?: string | null; income_kind?: string | null; counts_as?: 'available' | 'kept' | null; refund_of?: string | null; category_parts?: TransactionRow['category_parts'] /* 10.1-16 (D-01): the line's category parts as stored; absent or null = not split */; created_at?: string | null /* 05.5-28 Q11 A: with unspent_anchor_set_at, marks a same-day line logged after the confirm */ }; // goal_id: D-34/D-101, a transfer leg tagged to a savings goal or pot; debt_id: 06-37 D-35, a one-off debt payment

export interface SnapshotSource {
  today: string;
  homeCurrency: string;
  region: string | null; // 05-12 passes getDeviceRegion(rc.region) ?? null (RD-02: override > device region > time zone, never IP)
  rows: readonly SnapshotRow[];
  upcomingRows: readonly SnapshotRow[]; // live rows dated after the history window (05-12); only their pending one-offs are used
  series: readonly (Pick<
    RecurringSeriesRow,
    'id' | 'account_id' | 'amount' | 'currency' | 'freq' | 'anchor_date' | 'end_date' | 'occurrence_count' | 'category_id' | 'deleted_at'
  > &
    Partial<Pick<RecurringSeriesRow, 'counts_as' | 'income_kind' | 'saving_mode' | 'pay_group' | 'goal_id' | 'amount_kind'>>)[];
  accounts: readonly (Pick<AccountRow, 'id' | 'name' | 'kind' | 'currency' | 'archived_at' | 'deleted_at'> &
    Partial<Pick<AccountRow, 'use' | 'use_purpose' | 'use_envelope_id' | 'use_extra_set_aside' | 'overdraft_limit' | 'overdraft_rate' | 'is_shared'>>)[];
  balances: Readonly<Record<string, number>>; // account id → paid-only balance in the account's currency
  rates: readonly FxLatestRow[];
  categories: Readonly<Record<string, string | null>>; // category id → builtin_key (null for custom)
  settings: SettingsSource | null;
  debts: readonly DebtSource[];
  goals: readonly GoalSource[]; // D-101: every savings_goals row (kind 'pot' | 'wait'); done and deleted ones are filtered here
  statementPeriods: readonly { account_id: string; period_start: string; period_end: string }[];
  customCurrencies: readonly CustomCurrencyRow[];
  changes: readonly ChangeSource[];
  paymentLinks: readonly { check_id: string; target_id: string; check_kind: 'buy' | 'invest' }[];
  writtenRowLinks: readonly { check_id: string; target_id: string }[];
  /** 05.5-16 (D-11, OFO-4): category id to its Activity cap (categories.monthly_cap, home minor units); buildInputs reads it. Absent = none. */
  categoryCaps?: Readonly<Record<string, number | null>>;
  judgeOn?: Basis | null; // D-107: the user's Judge-on choice (device view). Absent or null = the stored settings basis_override applies
  // 05.4-33 (Decide v3 only; the old builder ignores both). D-126: the local day of the oldest real server fetch among the record
  // reads used; absent/null = unknown. D-127: writes still waiting to send; absent = 0. Notes only, never the sums (APP-02).
  recordsAsOf?: string | null;
  unsavedWrites?: number;
  // 05.4-35 (Decide v3 only): profiles.region_subdivision (D-19); absent/null = not set. It passes with whatever country `region`
  // resolved to, even from the device (D-142); the engine's tax table knows only real country-and-state pairs.
  regionSubdivision?: string | null;
  // 07 D-32..D-34 (WR-03): shared lines already carry the viewer's category (rows and series are resolved before the builder).
  // These two are for display only; the builder never reads them. Absent = none.
  /** A fellow member's own categories left on shared lines (display fields; never a money rule). */
  partnerCategories?: readonly PartnerCategoryRef[];
  /** A resolved category id → every stored category id now counted under it (an Insights tap opens Activity on all of them). */
  categorySourceIds?: CategorySourceIds;
}
