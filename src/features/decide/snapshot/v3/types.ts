// PURE. Mirrors the 05.2 columns structurally; 05.2 fills it. null = not set up.
export interface V3SeriesExtra {
  pay_group: string | null;
  counts_as: 'available' | 'kept' | null;
  income_kind: string | null;
  saving_mode: 'fixed' | 'flexible' | null;
  typical_choice: 'monthly' | 'excluded' | null;
  status: 'live' | 'ended' | 'dismissed' | null;
}

export interface V3SettingsSource {
  income_types: string[] | null;
  variable_method: string | null;
  steady_amount: number | null;
  hold_months: number | null;
  unspent_anchor: number | null;
  unspent_anchor_at: string | null;
  reserve_account_id: string | null;
  everyday_override: number | null;
  month_marks: Record<string, string> | null;
  rough_saving: number | null;
  rough_debt: number | null;
  rough_invest: number | null;
  rough_as_of: string | null;
  series_extra: Record<string, V3SeriesExtra>;
  dismissals: string[];
  own_lines: unknown[];
  custom_options: unknown;
  // 05.2 (names equal the migration columns). Optional so an old cached row or fixture reads as null / empty.
  income_pattern?: 'steady' | 'variable' | 'seasonal' | null;
  income_pattern_confirmed?: boolean | null;
  spread_months?: number | null;
  everyday_override_at?: string | null;
  reserve_goal?: number | null;
  unexplained_amount?: number | null;
  unexplained_use?: 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses' | null;
  unexplained_at?: string | null;
  answers?: readonly V3AnswerLite[];
  live_bridge_check_ids?: readonly string[]; // computed by settingsSourceOf from the checks
}

export interface V3AnswerLite {
  kind: 'pay_arrival' | 'expected_income' | 'held_bridge' | 'volatile_cover';
  key: string;
  amount: number | null;
  bool_value: boolean | null;
  on_date: string | null;
  check_id: string | null;
}
