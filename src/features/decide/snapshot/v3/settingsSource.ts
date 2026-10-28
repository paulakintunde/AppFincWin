// PURE. 05.2-19 (DSU-20): the stored decide rows -> V3SettingsSource. No React, no I/O. The D-17 pay-type mapping lives here:
// the engine keeps its three income types, and the six setup answers map onto them with no engine change.
import type { IncomeType } from '@/engine/decide/v3';
import type { DecideAnswerRow } from '@/db/decideAnswers';
import type { DecideSettingsRow } from '@/db/decideSettings';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import type { V3SettingsSource } from './types';

const ENGINE_TYPE: Readonly<Record<string, IncomeType>> = {
  salary_or_wages: 'salary',
  pension_or_benefits: 'salary', // D-17: a pension is steady pay
  commission_or_tips: 'commission',
  freelance: 'freelance',
  own_business: 'freelance', // D-17
  none: 'none',
  // Engine values already in a stored or exported source pass through unchanged.
  salary: 'salary',
  commission: 'commission',
  mix: 'mix',
};

/** D-17: the setup values as engine income types, de-duplicated with the first-seen order kept. Unknown values are dropped. */
export function engineIncomeTypes(setup: readonly string[] | null): IncomeType[] {
  const out: IncomeType[] = [];
  for (const value of setup ?? []) {
    const mapped = ENGINE_TYPE[value];
    if (mapped !== undefined && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export interface SettingsSourceInput {
  settings: DecideSettingsRow | null;
  answers: readonly DecideAnswerRow[];
  dismissals: readonly RecurringDismissalRow[];
  checks: readonly { id: string; status: string; deleted_at: string | null }[];
  planLive: (checkId: string) => boolean; // from links, debts and series in the snapshot source
}

/** Pitfall 9: a held-back bridge counts only while its check is bought, not deleted, and its plan is still live. */
function liveBridgeCheckIds(input: SettingsSourceInput): string[] {
  return input.checks.filter((c) => c.status === 'bought' && c.deleted_at === null && input.planLive(c.id)).map((c) => c.id);
}

export function settingsSourceOf(input: SettingsSourceInput): V3SettingsSource | null {
  const s = input.settings;
  if (s === null) return null;
  return {
    income_types: s.income_types,
    variable_method: s.variable_method,
    steady_amount: s.steady_amount,
    hold_months: s.hold_months,
    unspent_anchor: s.unspent_anchor,
    unspent_anchor_at: s.unspent_anchor_at,
    reserve_account_id: s.reserve_account_id,
    everyday_override: s.everyday_override,
    month_marks: s.month_marks,
    rough_saving: s.rough_saving,
    rough_debt: s.rough_debt,
    rough_invest: s.rough_invest,
    rough_as_of: s.rough_as_of,
    series_extra: {},
    dismissals: input.dismissals.filter((d) => d.deleted_at === null).map((d) => d.payee_key),
    own_lines: [],
    custom_options: null,
    income_pattern: s.income_pattern,
    income_pattern_confirmed: s.income_pattern_confirmed,
    // 05.2-37: three stored fields are passed through but not mapped into V3Inputs, on purpose.
    // - spread_months: the engine spreads a payment by its own `coversMonths`, and "a large payment" has no rule that
    //   picks which lines it applies to. Mapping it to every line would spread small payments too. It stays stored for
    //   05.3, where the in-check question sets coversMonths per payment.
    // - everyday_override_at: this is RefineInput.overrideAt for refine(), which 05.3 calls. It is not a V3Inputs field.
    // - reserve_goal: the fund is a lock, never a target (I31, I38). The goal is only the setup and sheet hint, so the
    //   engine has no use for it.
    spread_months: s.spread_months,
    everyday_override_at: s.everyday_override_at,
    reserve_goal: s.reserve_goal,
    unexplained_amount: s.unexplained_amount,
    unexplained_use: s.unexplained_use,
    unexplained_at: s.unexplained_at,
    answers: input.answers
      .filter((a) => a.deleted_at === null)
      .map((a) => ({ kind: a.kind, key: a.key, amount: a.amount, bool_value: a.bool_value, on_date: a.on_date, check_id: a.check_id })),
    live_bridge_check_ids: liveBridgeCheckIds(input),
  };
}
