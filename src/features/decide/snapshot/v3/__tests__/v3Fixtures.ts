import type { V3SettingsSource } from '../types';

export const v3s = (over: Partial<V3SettingsSource> = {}): V3SettingsSource => ({
  income_types: null, variable_method: null, steady_amount: null, hold_months: null,
  unspent_anchor: null, unspent_anchor_at: null, reserve_account_id: null, everyday_override: null, month_marks: null,
  rough_saving: null, rough_debt: null, rough_invest: null, rough_as_of: null,
  series_extra: {}, dismissals: [], own_lines: [], custom_options: null,
  ...over,
});
