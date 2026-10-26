/**
 * Codes → i18n keys (05.1, v3 §4.6, I22). Keys only: English lives in src/i18n/locales/en.ts under decide.v3.
 *
 * One code, one sentence: every code and variant maps to exactly one chip key, one title key and one body key.
 */
import type { Code, FactCode, MissingCode, NoticeCode, ReadinessCode, Variant } from '../types';

export interface VerdictRow {
  readonly chipKey: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly tone: 'fits' | 'caution' | 'short' | 'input';
}

function row(name: string, tone: VerdictRow['tone']): VerdictRow {
  return Object.freeze({
    chipKey: `decide.v3.verdict.${name}.chip`,
    titleKey: `decide.v3.verdict.${name}.title`,
    bodyKey: `decide.v3.verdict.${name}.body`,
    tone,
  });
}

export const VERDICT_TABLE = Object.freeze({
  fits_month: row('fitsMonth', 'fits'),
  'fits_month.low_month': row('fitsMonthLowMonth', 'caution'),
  fits_unspent: row('fitsUnspent', 'fits'),
  'fits_unspent.low_month': row('fitsUnspentLowMonth', 'caution'),
  'not_yet.payday': row('notYetPayday', 'caution'),
  'not_yet.not_covered': row('notYetNotCovered', 'short'),
  monthly_short: row('monthlyShort', 'short'),
  emergency_use: row('emergencyUse', 'caution'),
  needs_input: row('needsInput', 'input'),
} as const satisfies Record<string, VerdictRow>);

export type VerdictRowKey = keyof typeof VERDICT_TABLE;

/** Variant-aware lookup. A null variant gives the base row (not_yet defaults to not_covered); low_month only applies to fits codes. */
export function verdictRowFor(code: Code, variant: Variant | null): VerdictRow {
  switch (code) {
    case 'fits_month':
      return variant === 'low_month' ? VERDICT_TABLE['fits_month.low_month'] : VERDICT_TABLE.fits_month;
    case 'fits_unspent':
      return variant === 'low_month' ? VERDICT_TABLE['fits_unspent.low_month'] : VERDICT_TABLE.fits_unspent;
    case 'not_yet':
      return variant === 'payday' ? VERDICT_TABLE['not_yet.payday'] : VERDICT_TABLE['not_yet.not_covered'];
    case 'monthly_short':
      return VERDICT_TABLE.monthly_short;
    case 'emergency_use':
      return VERDICT_TABLE.emergency_use;
    case 'needs_input':
      return VERDICT_TABLE.needs_input;
  }
}

export const NOTICE_KEYS = Object.freeze({
  typical_short: 'decide.v3.notice.typical_short',
  month_heading_short: 'decide.v3.notice.month_heading_short',
  unspent_stale: 'decide.v3.notice.unspent_stale',
  unspent_drifted: 'decide.v3.notice.unspent_drifted',
  emergency_not_set: 'decide.v3.notice.emergency_not_set',
  unsaved_changes: 'decide.v3.notice.unsaved_changes',
  yearly_bill_choice_needed: 'decide.v3.notice.yearly_bill_choice_needed',
  month_looks_under_logged: 'decide.v3.notice.month_looks_under_logged',
  income_kind_unmarked: 'decide.v3.notice.income_kind_unmarked',
  from_your_figures: 'decide.v3.notice.from_your_figures',
  income_from_expected: 'decide.v3.notice.income_from_expected',
  pay_capped_expected: 'decide.v3.notice.pay_capped_expected',
  same_season_compared: 'decide.v3.notice.same_season_compared',
  history_window_12: 'decide.v3.notice.history_window_12',
  income_volatile: 'decide.v3.notice.income_volatile',
  envelope_location_assumed: 'decide.v3.notice.envelope_location_assumed',
  unexplained_money: 'decide.v3.notice.unexplained_money',
  account_use_unknown: 'decide.v3.notice.account_use_unknown',
  pay_not_seen: 'decide.v3.notice.pay_not_seen',
  pay_counted_missed: 'decide.v3.notice.pay_counted_missed',
  fund_account_unknown: 'decide.v3.notice.fund_account_unknown',
} as const satisfies Record<NoticeCode, string>);

export const FACT_KEYS = Object.freeze({
  month_left_after: 'decide.v3.fact.month_left_after',
  unspent_before_after: 'decide.v3.fact.unspent_before_after',
  emergency_untouched: 'decide.v3.fact.emergency_untouched',
  emergency_used: 'decide.v3.fact.emergency_used',
  envelope_used: 'decide.v3.fact.envelope_used',
  line_crossed: 'decide.v3.fact.line_crossed',
  quoted_differs: 'decide.v3.fact.quoted_differs',
  implied_rate: 'decide.v3.fact.implied_rate',
  deferred_interest_term: 'decide.v3.fact.deferred_interest_term',
  at_todays_rate: 'decide.v3.fact.at_todays_rate',
  low_month: 'decide.v3.fact.low_month',
  lean_bridge: 'decide.v3.fact.lean_bridge',
  unspent_held_back: 'decide.v3.fact.unspent_held_back',
  lean_months_judged: 'decide.v3.fact.lean_months_judged',
  low_month_judged: 'decide.v3.fact.low_month_judged',
  rests_on_your_answer: 'decide.v3.fact.rests_on_your_answer',
} as const satisfies Record<FactCode, string>);

export const MISSING_KEYS = Object.freeze({
  no_income_figures: 'decide.v3.missing.no_income_figures',
  unspent_not_confirmed: 'decide.v3.missing.unspent_not_confirmed',
  records_look_behind: 'decide.v3.missing.records_look_behind',
  no_price: 'decide.v3.missing.no_price',
  plan_count_missing: 'decide.v3.missing.plan_count_missing',
  first_payment_not_chosen: 'decide.v3.missing.first_payment_not_chosen',
  pause_interest_not_answered: 'decide.v3.missing.pause_interest_not_answered',
  plan_rate_missing: 'decide.v3.missing.plan_rate_missing',
  everyday_unknown: 'decide.v3.missing.everyday_unknown',
  legacy_invest_check: 'decide.v3.missing.legacy_invest_check',
  share_invalid: 'decide.v3.missing.share_invalid',
  income_pattern_unconfirmed: 'decide.v3.missing.income_pattern_unconfirmed',
  expected_income_needed: 'decide.v3.missing.expected_income_needed',
  first_payment_passed: 'decide.v3.missing.first_payment_passed',
  volatile_cover_question: 'decide.v3.missing.volatile_cover_question',
  unexplained_money_question: 'decide.v3.missing.unexplained_money_question',
  account_use_question: 'decide.v3.missing.account_use_question',
  pay_arrival_question: 'decide.v3.missing.pay_arrival_question',
} as const satisfies Record<MissingCode, string>);

export const READINESS_KEYS = Object.freeze({
  past_month_missing: 'decide.v3.readiness.past_month_missing',
  activity_not_current: 'decide.v3.readiness.activity_not_current',
  envelopes_unconfirmed: 'decide.v3.readiness.envelopes_unconfirmed',
} as const satisfies Record<ReadinessCode, string>);

/** The footer sits outside en.decide on purpose (owner wording, 2026-10-26). */
export const FOOTER_KEY = 'legal.decideFooter';
