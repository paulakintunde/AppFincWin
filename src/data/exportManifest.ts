/**
 * 05.2 (owner OQ3, C13): every user-data table and its exportable columns. Phase 10 (DAT-02)
 * builds the download on top; this list is the coverage contract.
 *
 * Exportable columns are the ones a person would recognise as theirs. Internal bookkeeping
 * (`version`, `updated_by`) is left out. `profiles.decide_v3` is an access switch, not user
 * data, so it is deliberately absent.
 *
 * The guard test (`__tests__/exportManifest.test.ts`) fails when a module in src/db reads a
 * table that is in neither EXPORT_MANIFEST nor NOT_USER_DATA.
 */

export const EXPORT_MANIFEST: Readonly<Record<string, readonly string[]>> = {
  transactions: [
    'id', 'household_id', 'account_id', 'created_by', 'original_amount', 'original_currency', 'home_currency', 'home_amount',
    'rate', 'orig_per_eur', 'home_per_eur', 'orig_custom_unit_value', 'orig_custom_ref_per_eur', 'home_custom_unit_value',
    'home_custom_ref_per_eur', 'rate_date', 'rate_source', 'rate_pending', 'local_date', 'time_zone', 'note', 'name',
    'category_id', 'payment_type', 'status', 'deleted_at', 'import_batch_id', 'recurring_series_id', 'occurrence_date',
    'raw_amount', 'raw_balance', 'external_id', 'import_format', 'transfer_id', 'is_refund', 'is_automatic', 'one_off',
    'goal_id', 'stmt_orig_amount', 'stmt_orig_currency', 'conversion_source', 'fx_fee_of', 'created_at', 'updated_at',
    // 05.2
    'income_kind', 'counts_as', 'refund_of',
  ],
  accounts: [
    'id', 'household_id', 'created_by', 'name', 'kind', 'currency', 'opening_balance', 'archived_at', 'overdraft_limit',
    'credit_limit', 'deleted_at', 'created_at', 'updated_at',
    // 05.2
    'use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside',
  ],
  categories: ['id', 'owner_id', 'builtin_key', 'name', 'color_key', 'is_system', 'archived_at', 'monthly_cap', 'created_at', 'updated_at'],
  category_rules: [
    'id', 'scope', 'owner_id', 'household_id', 'created_by', 'keyword', 'keyword_norm', 'category_id', 'target_builtin_key',
    'target_name', 'deleted_at', 'created_at', 'updated_at',
  ],
  recurring_series: [
    'id', 'household_id', 'created_by', 'account_id', 'name', 'amount', 'currency', 'category_id', 'payment_type', 'freq',
    'anchor_date', 'time_zone', 'end_date', 'occurrence_count', 'materialised_through', 'deleted_at', 'is_automatic',
    'created_at', 'updated_at',
    // 05.2
    'counts_as', 'income_kind', 'saving_mode', 'pay_group',
  ],
  custom_currencies: ['id', 'owner_id', 'code', 'symbol', 'decimals', 'reference_currency', 'unit_value', 'as_of', 'created_at', 'updated_at'],
  import_profiles: ['id', 'owner_id', 'account_id', 'layout_signature', 'profile', 'created_at'],
  undo_log: ['id', 'owner_id', 'label_key', 'label_params', 'status', 'refusal', 'created_at', 'resolved_at'],
  dismissed_series_offers: ['offer_key', 'created_at'],
  statement_periods: ['id', 'household_id', 'account_id', 'period_start', 'period_end', 'import_batch_id'],
  households: ['id', 'horizon_month'],
  household_members: ['household_id', 'user_id', 'display_name'],
  profiles: [
    'home_currency', 'show_cents', 'lead_figure', 'region', 'week_start', 'sample_prompt_answered_at',
    // profiles.decide_v3 is an access switch, not user data: excluded on purpose (05.2).
  ],
  decide_checks: [
    'id', 'household_id', 'created_by', 'kind', 'name', 'inputs', 'status', 'furthest_step', 'last_seen_state', 'last_seen_basis',
    'reopened_from', 'decided_at', 'verdict_at_decision', 'estimate_day_one', 'estimate_monthly', 'wait_monthly', 'ready_by',
    'broke_line', 'cooling_off_at', 'estimate_monthly_payment', 'estimate_running', 'deleted_at', 'created_at', 'updated_at',
  ],
  decide_links: ['id', 'household_id', 'created_by', 'check_id', 'entity', 'target_id', 'source', 'role', 'deleted_at', 'created_at', 'updated_at'],
  decide_changes: [
    'id', 'household_id', 'created_by', 'kind', 'name', 'monthly_amount', 'currency', 'start_month', 'end_month', 'deleted_at',
    'created_at', 'updated_at',
  ],
  debts: [
    'id', 'household_id', 'account_id', 'check_id', 'series_id', 'name', 'kind', 'currency', 'balance', 'apr', 'minimum_payment',
    'secured', 'term_months', 'start_date', 'min_percent', 'min_interest_added', 'min_floor', 'paid_in_full', 'is_housing',
    'deleted_at', 'created_at', 'updated_at',
    // 05.2
    'pays_in_full',
  ],
  savings_goals: [
    'id', 'household_id', 'created_by', 'check_id', 'name', 'currency', 'target', 'monthly_amount', 'ready_by', 'opening_saved',
    'kind', 'done_at', 'deleted_at', 'created_at', 'updated_at',
    // 05.2
    'bucket', 'account_id', 'color_key',
  ],
  decide_settings: [
    'id', 'user_id', 'currency', 'rough_income', 'rough_spending', 'reserve', 'dsr_line', 'housing_line', 'unsecured_multiple',
    'investing_floor', 'saving_floor', 'basis_override', 'updated_at',
    // 05.2
    'income_types', 'income_pattern', 'income_pattern_confirmed', 'variable_method', 'steady_amount', 'spread_months',
    'hold_months', 'share_pct', 'detail', 'remind_plan', 'remind_unspent', 'setup_done_at', 'everyday_override',
    'everyday_override_at', 'month_marks', 'unspent_anchor', 'unspent_anchor_at', 'reserve_account_id', 'reserve_goal',
    'rough_saving', 'rough_debt', 'rough_invest', 'rough_as_of', 'unexplained_amount', 'unexplained_use', 'unexplained_at',
    'refine_last_at', 'refine_snooze_until',
  ],
  recurring_dismissals: ['id', 'household_id', 'payee_key', 'direction', 'dismissed_at', 'created_by', 'deleted_at', 'created_at', 'updated_at'],
  income_payer_prompts: [
    'id', 'household_id', 'payer_key', 'income_kind', 'counts_as', 'apply_to_future', 'created_by', 'deleted_at', 'created_at', 'updated_at',
  ],
  decide_answers: [
    'id', 'household_id', 'created_by', 'kind', 'key', 'amount', 'bool_value', 'on_date', 'check_id', 'deleted_at', 'created_at', 'updated_at',
  ],
};

/** Tables src/db reads that hold no user data of their own, each with the reason. */
export const NOT_USER_DATA: readonly string[] = [
  'transactions_active', // a view over transactions (not-deleted rows); exported through transactions
  'statement_periods_live', // a view over statement_periods; exported through statement_periods
];
