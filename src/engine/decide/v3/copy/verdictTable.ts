/**
 * Codes → i18n keys (05.1, v3 §4.6, I22). Keys only: English lives in src/i18n/locales/en.ts under decide.v3.
 *
 * One code, one sentence: every code and variant maps to exactly one chip key, one title key and one body key.
 */
import type { Basis, Code, ConfidenceReason, FactCode, MissingCode, NextStepCode, NoticeCode, ReadinessCode, Variant } from '../types';

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
  // 05.4 FIN-01 (D-35): a fit while the safety net is empty or small is amber.
  'fits_month.no_net': row('fitsNoNet', 'caution'),
  'fits_month.small_net': row('fitsSmallNet', 'caution'),
  'fits_unspent.no_net': row('fitsNoNet', 'caution'),
  'fits_unspent.small_net': row('fitsSmallNet', 'caution'),
  'not_yet.payday': row('notYetPayday', 'caution'),
  'not_yet.not_covered': row('notYetNotCovered', 'short'),
  monthly_short: row('monthlyShort', 'short'),
  // 05.4 D-41: emergency_use stays a valid stored code; it reads the "Dips into your safety net" copy. The engine never returns it.
  emergency_use: row('fitsUsesNet', 'caution'),
  // 05.4 FIN-02 / ENG-04 (D-35, D-06): uses money in the safety net, whatever the purpose.
  fits_uses_net: row('fitsUsesNet', 'caution'),
  'fits_uses_net.protection_off': row('fitsUsesNetProtectionOff', 'caution'),
  needs_input: row('needsInput', 'input'),
  // 05.4 FIN-03 (D-26, D-36): no new tone (design restraint); the not-cleared warning leads its body.
  fits_uses_overdraft: row('fitsUsesOverdraft', 'caution'),
  'fits_uses_overdraft.not_cleared': row('fitsUsesOverdraftNotCleared', 'caution'),
} as const satisfies Record<string, VerdictRow>);

export type VerdictRowKey = keyof typeof VERDICT_TABLE;

/** The fits variants with their own row; any other variant on a fits code gives the base row. */
const FITS_VARIANTS = ['low_month', 'no_net', 'small_net'] as const;
type FitsVariant = (typeof FITS_VARIANTS)[number];
const isFitsVariant = (v: Variant | null): v is FitsVariant => v !== null && (FITS_VARIANTS as readonly string[]).includes(v);

/**
 * Variant-aware lookup. A null variant gives the base row (not_yet defaults to not_covered); low_month, no_net and small_net only
 * apply to fits codes, protection_off only to fits_uses_net.
 */
export function verdictRowFor(code: Code, variant: Variant | null): VerdictRow {
  switch (code) {
    case 'fits_month':
      return isFitsVariant(variant) ? VERDICT_TABLE[`fits_month.${variant}` as const] : VERDICT_TABLE.fits_month;
    case 'fits_unspent':
      return isFitsVariant(variant) ? VERDICT_TABLE[`fits_unspent.${variant}` as const] : VERDICT_TABLE.fits_unspent;
    case 'not_yet':
      return variant === 'payday' ? VERDICT_TABLE['not_yet.payday'] : VERDICT_TABLE['not_yet.not_covered'];
    case 'monthly_short':
      return VERDICT_TABLE.monthly_short;
    case 'emergency_use':
      return VERDICT_TABLE.emergency_use;
    case 'fits_uses_net':
      return variant === 'protection_off' ? VERDICT_TABLE['fits_uses_net.protection_off'] : VERDICT_TABLE.fits_uses_net;
    case 'fits_uses_overdraft':
      return variant === 'not_cleared' ? VERDICT_TABLE['fits_uses_overdraft.not_cleared'] : VERDICT_TABLE.fits_uses_overdraft;
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
  pay_expected_from_history: 'decide.v3.notice.pay_expected_from_history',
} as const satisfies Record<NoticeCode, string>);

export const FACT_KEYS = Object.freeze({
  month_left_after: 'decide.v3.fact.month_left_after',
  unspent_before_after: 'decide.v3.fact.unspent_before_after',
  emergency_untouched: 'decide.v3.fact.emergency_untouched',
  net_used: 'decide.v3.fact.net_used',
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
  no_full_month: 'decide.v3.fact.no_full_month',
  overdraft_use: 'decide.v3.fact.overdraft_use',
  overdraft_without_purchase: 'decide.v3.fact.overdraft_without_purchase',
  overdraft_purchase_adds: 'decide.v3.fact.overdraft_purchase_adds',
  overdraft_not_cleared: 'decide.v3.fact.overdraft_not_cleared',
  overdraft_cost_90d: 'decide.v3.fact.overdraft_cost_90d',
  wait_clears: 'decide.v3.fact.wait_clears',
  overdraft_repeat: 'decide.v3.fact.overdraft_repeat',
  other_account_overdrawn: 'decide.v3.fact.other_account_overdrawn',
  no_overdraft_limit: 'decide.v3.fact.no_overdraft_limit',
  ready_without_interest: 'decide.v3.fact.ready_without_interest',
  clearing_first: 'decide.v3.fact.clearing_first',
  net_left: 'decide.v3.fact.net_left',
  net_refill: 'decide.v3.fact.net_refill',
  net_zero_is_off: 'decide.v3.fact.net_zero_is_off',
  net_protection_off: 'decide.v3.fact.net_protection_off',
  net_none_start: 'decide.v3.fact.net_none_start',
  net_progress: 'decide.v3.fact.net_progress',
  net_above_size: 'decide.v3.fact.net_above_size',
  wait_keeps_net: 'decide.v3.fact.wait_keeps_net',
  need_net_line: 'decide.v3.fact.need_net_line',
  bills_held_back: 'decide.v3.fact.bills_held_back',
  yearly_bill_ahead: 'decide.v3.fact.yearly_bill_ahead',
  net_locked: 'decide.v3.fact.net_locked',
} as const satisfies Record<FactCode, string>);

/**
 * 05.4 FIN-03 (D-38): the answers a fact offers. no_overdraft_limit asks whether the account has an overdraft; both actions open
 * the account's settings (the fact carries accountId). Screens are 08.1.
 */
export const FACT_ACTION_KEYS = Object.freeze({
  no_overdraft_limit: { addLimit: 'decide.v3.factAction.addLimit', noOverdraft: 'decide.v3.factAction.noOverdraft' },
} as const satisfies Partial<Record<FactCode, Readonly<Record<string, string>>>>);

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

/** 05.4 UX-04 / CMP-F12: the basis sentence for each kind. records_with_reason reads BASIS_REASON_KEYS[basis.reason]. */
export const BASIS_KEYS = Object.freeze({
  quick_estimates: 'decide.v3.basis.quickEstimates',
  partial: 'decide.v3.basis.partial',
  records: 'decide.v3.basis.records',
} as const satisfies Record<Exclude<Basis['kind'], 'records_with_reason'>, string>);

/**
 * The 'answer' reasons that can lead a records basis. few_months never does: under 3 months the basis is partial first
 * (confidence/reasons.ts buildBasis).
 */
export const BASIS_REASON_KEYS = Object.freeze({
  user_said_cover: 'decide.v3.basis.recordsWithReason.user_said_cover',
  quick_estimates: 'decide.v3.basis.recordsWithReason.quick_estimates',
  pay_missed: 'decide.v3.basis.recordsWithReason.pay_missed',
  close_to_line: 'decide.v3.basis.recordsWithReason.close_to_line',
} as const satisfies Partial<Record<ConfidenceReason, string>>);

/** The placeholders in each basis sentence: date is basis.upTo; quick_estimates has none. */
export const BASIS_VALUE_KEYS: Readonly<Record<Basis['kind'], readonly string[]>> = Object.freeze({
  quick_estimates: [],
  partial: ['used', 'lookedFor'],
  records: ['months', 'date'],
  records_with_reason: ['months', 'date'],
});

export const NEXT_STEP_KEYS = Object.freeze({
  add_records: 'decide.v3.nextStep.add_records',
  log_spending: 'decide.v3.nextStep.log_spending',
  confirm_unspent: 'decide.v3.nextStep.confirm_unspent',
  save_changes: 'decide.v3.nextStep.save_changes',
  record_pay: 'decide.v3.nextStep.record_pay',
  finish_setup: 'decide.v3.nextStep.finish_setup',
} as const satisfies Record<NextStepCode, string>);

export const READINESS_KEYS = Object.freeze({
  past_month_missing: 'decide.v3.readiness.past_month_missing',
  activity_not_current: 'decide.v3.readiness.activity_not_current',
  envelopes_unconfirmed: 'decide.v3.readiness.envelopes_unconfirmed',
} as const satisfies Record<ReadinessCode, string>);

/**
 * M-03 (05.1-40): the value keys each fact and notice emits, one settled set per code. The en.ts copy reads exactly
 * these (directly, through a `_variant` string the UI picks, or through a COPY_RESOLVERS id the UI turns into a name),
 * and copyContract.test.ts keeps the two in step in both directions. Runtime source of truth; 05.3 builds on it.
 */
export const FACT_VALUE_KEYS: Readonly<Record<FactCode, readonly string[]>> = Object.freeze({
  month_left_after: ['month', 'left'],
  unspent_before_after: ['before', 'after'],
  emergency_untouched: ['amount'],
  net_used: ['used'],
  envelope_used: ['used', 'envelopeId'],
  line_crossed: ['lineId', 'kind', 'unit', 'value', 'limit'], // unit: 'percent' | 'money' | 'tenths'
  quoted_differs: ['quoted', 'computed'],
  implied_rate: ['rate'], // readable decimal string, e.g. "22.9"
  deferred_interest_term: [],
  at_todays_rate: ['currency'],
  low_month: ['month', 'left', 'monthly'],
  lean_bridge: ['monthly', 'leanLeft', 'shortfall', 'months', 'until', 'bridge', 'after'],
  unspent_held_back: ['amount'],
  lean_months_judged: ['from', 'to', 'leanLeft'],
  low_month_judged: ['month', 'left'],
  rests_on_your_answer: ['monthly', 'months'],
  no_full_month: [],
  // 05.4 FIN-03. zero is always 0, formatted as the currency's zero ("below $0"). rate and cost are left out when no rate is
  // set (the _no_rate copy); date is left out when no pay lands inside the 90 days (the _no_pay copy).
  overdraft_use: ['accountId', 'below', 'days', 'rate', 'cost', 'zero'],
  overdraft_without_purchase: ['below', 'days', 'cost', 'zero'], // days 0: the _above copy
  overdraft_purchase_adds: ['cost'],
  overdraft_not_cleared: ['accountId', 'date', 'below', 'zero'],
  overdraft_cost_90d: ['rate', 'cost', 'zero'],
  wait_clears: ['month', 'zero'],
  overdraft_repeat: ['accountId', 'count', 'of', 'rate', 'cost', 'zero'],
  other_account_overdrawn: ['accountId', 'below', 'rate', 'monthlyCost', 'zero'],
  no_overdraft_limit: ['accountId', 'below', 'zero'],
  ready_without_interest: [],
  clearing_first: ['zero'],
  // 05.4 FIN-01 / FIN-02 (D-35, D-41, D-06). wait_keeps_net carries date (a payday) or month (the _month copy).
  net_left: ['left'],
  net_refill: ['months'],
  net_zero_is_off: ['zero'],
  net_protection_off: [],
  net_none_start: ['starter'],
  net_progress: ['saved', 'size'],
  net_above_size: ['above'],
  wait_keeps_net: ['date', 'month'],
  need_net_line: [],
  // 05.4 FIN-11 (D-47): seriesId resolves to the bill's name.
  bills_held_back: ['total'],
  yearly_bill_ahead: ['seriesId', 'amount', 'dueDate'],
  // 05.4 D-61: the locked net up to its size.
  net_locked: ['locked'],
});

export const NOTICE_VALUE_KEYS: Readonly<Record<NoticeCode, readonly string[]>> = Object.freeze({
  typical_short: ['short'], // positive
  month_heading_short: ['month', 'short', 'categoryId', 'largest'], // categoryId and largest are omitted with no largest line
  unspent_stale: ['days'],
  unspent_drifted: ['suggested'],
  emergency_not_set: [],
  unsaved_changes: ['count'],
  yearly_bill_choice_needed: ['seriesId'],
  month_looks_under_logged: ['month'],
  income_kind_unmarked: [],
  from_your_figures: [],
  income_from_expected: ['month', 'amount', 'source', 'sameMonth'], // source: 'confirmed' | 'last_year' | 'low'; sameMonth only for 'last_year'
  pay_capped_expected: ['capped'],
  same_season_compared: ['lastYear', 'everyday'],
  history_window_12: ['months'],
  income_volatile: ['payment', 'periods', 'monthly', 'months', 'leanFrom', 'leanTo', 'leanLeft'],
  envelope_location_assumed: ['count'],
  unexplained_money: ['amount'],
  account_use_unknown: ['accountId', 'count'],
  pay_not_seen: ['amount', 'date'],
  pay_counted_missed: ['amount', 'date'],
  fund_account_unknown: ['amount'],
  pay_expected_from_history: ['amount', 'day', 'months'], // 05.4 D-52
});

/** An id the engine emits that the UI resolves to a name; the copy placeholder is the value. */
export const COPY_RESOLVERS = { categoryId: 'category', seriesId: 'bill', envelopeId: 'envelope', accountId: 'account' } as const;

/** Keys that pick a copy variant or identify a line; they need no placeholder of their own. */
export const DISCRIMINATOR_KEYS = ['lineId', 'kind', 'unit', 'source'] as const;

/** D-48, D-49, D-54, D-58: a missing code's copy reads its placeholder values from this notice. */
export const MISSING_VALUE_SOURCE = {
  volatile_cover_question: 'income_volatile',
  unexplained_money_question: 'unexplained_money',
  account_use_question: 'account_use_unknown',
  pay_arrival_question: 'pay_not_seen',
} as const satisfies Partial<Record<MissingCode, NoticeCode>>;

/** The footer sits outside en.decide on purpose (owner wording, 2026-10-26). */
export const FOOTER_KEY = 'legal.decideFooter';
