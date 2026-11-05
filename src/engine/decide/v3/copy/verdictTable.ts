/**
 * Codes → i18n keys (05.1, v3 §4.6, I22). Keys only: English lives in src/i18n/locales/en.ts under decide.v3.
 *
 * One code, one sentence: every code and variant maps to exactly one chip key, one title key and one body key.
 */
import type { Basis, Code, ConfidenceReason, FactCode, MissingCode, NextStepCode, NoticeCode, ReadinessCode, Variant } from '../types';

export interface VerdictRow<K extends string = string> {
  readonly chipKey: K;
  readonly titleKey: K;
  readonly bodyKey: K;
  readonly tone: 'fits' | 'caution' | 'short' | 'input';
}

/** 05.4-37 APP-20: the keys are literal types, so src/i18n/__tests__/decideV3Keys.typecheck.ts can hold every one against en.ts. */
export interface VerdictRowOf<N extends string> extends VerdictRow {
  readonly chipKey: `decide.v3.verdict.${N}.chip`;
  readonly titleKey: `decide.v3.verdict.${N}.title`;
  readonly bodyKey: `decide.v3.verdict.${N}.body`;
}

function row<N extends string>(name: N, tone: VerdictRow['tone']): VerdictRowOf<N> {
  return Object.freeze({
    chipKey: `decide.v3.verdict.${name}.chip` as const,
    titleKey: `decide.v3.verdict.${name}.title` as const,
    bodyKey: `decide.v3.verdict.${name}.body` as const,
    tone,
  });
}

export const VERDICT_TABLE = Object.freeze({
  fits_month: row('fitsMonth', 'fits'),
  'fits_month.low_month': row('fitsMonthLowMonth', 'caution'),
  fits_unspent: row('fitsUnspent', 'fits'),
  'fits_unspent.low_month': row('fitsUnspentLowMonth', 'caution'),
  // 05.4 FIN-07 / D-40: "Fits, but tight each month" on a plan (either fit code), "Fits, but tight" on a one-off. Same tone (design
  // restraint). verdictRowFor picks the one-off rows when the check is paid once (or is a D-68 plan judged by cash).
  'fits_month.tight': row('fitsMonthTight', 'caution'),
  'fits_unspent.tight_plan': row('fitsMonthTight', 'caution'),
  'fits_month.tight_once': row('fitsMonthTightOnce', 'caution'),
  'fits_unspent.tight': row('fitsUnspentTight', 'caution'),
  // 05.4 FIN-01 (D-35): a fit while the safety net is empty or small is amber.
  'fits_month.no_net': row('fitsNoNet', 'caution'),
  'fits_month.small_net': row('fitsSmallNet', 'caution'),
  'fits_unspent.no_net': row('fitsNoNet', 'caution'),
  'fits_unspent.small_net': row('fitsSmallNet', 'caution'),
  // 05.4 D-62: paid in part from money saved above the safety net's size.
  'fits_unspent.extra_savings': row('fitsUnspentExtraSavings', 'fits'),
  // 05.4 D-39b: money saved in earlier months goes on this while a debt at 20% APR or more remains.
  'fits_unspent.costly_debt': row('fitsUnspentCostlyDebt', 'caution'),
  // 05.4 D-63: the usual month is already short before the purchase: "No: your month is already short", on any answer but an ask.
  'fits_month.month_already_short': row('monthAlreadyShort', 'short'),
  'fits_unspent.month_already_short': row('monthAlreadyShort', 'short'),
  'fits_uses_net.month_already_short': row('monthAlreadyShort', 'short'),
  'fits_uses_overdraft.month_already_short': row('monthAlreadyShort', 'short'),
  'monthly_short.month_already_short': row('monthAlreadyShort', 'short'),
  'not_yet.month_already_short': row('monthAlreadyShort', 'short'),
  'emergency_use.month_already_short': row('monthAlreadyShort', 'short'),
  'fits_by_borrowing.month_already_short': row('monthAlreadyShort', 'short'), // 05.4 FIN-05: the month-short headline keeps the lead
  'fits_on_your_answer.month_already_short': row('monthAlreadyShort', 'short'), // 05.4 FIN-08: the same row for every answer but an ask
  // 05.4 D-65: the usual month is already short and a cash fit eats less than (Small) / at least (Moderate) one month of the spare
  // money and extra savings propping it up. No new tone (design restraint).
  'fits_month.month_short_small': row('monthShortSmall', 'caution'),
  'fits_unspent.month_short_small': row('monthShortSmall', 'caution'),
  'fits_month.month_short_moderate': row('monthShortModerate', 'caution'),
  'fits_unspent.month_short_moderate': row('monthShortModerate', 'caution'),
  'fits_unspent.month_short_moderate_extra': row('monthShortModerateExtra', 'caution'),
  // 05.4 FIN-05: an expensive plan judged by cash (D-68) in an already-short month keeps its D-65 headline on fits_by_borrowing.
  'fits_by_borrowing.month_short_small': row('monthShortSmall', 'caution'),
  'fits_by_borrowing.month_short_moderate': row('monthShortModerate', 'caution'),
  'fits_by_borrowing.month_short_moderate_extra': row('monthShortModerateExtra', 'caution'),
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
  // 05.4 FIN-05 (D-07, D-39a): a plan that fits only because it is borrowed (cash Not yet), and a plan chosen while cash fits that
  // costs 20% APR or more, or interest of 10% or more of the amount borrowed. No new tone (design restraint).
  fits_by_borrowing: row('fitsByBorrowing', 'caution'),
  'fits_by_borrowing.borrowing_costs_more': row('fitsByBorrowingCostsMore', 'caution'),
  // 05.4 FIN-08 / CMP-F01 (05.4-23): the records do not show it fits; it rests on the user's yes. Amber, never plain Fits (I61).
  fits_on_your_answer: row('fitsOnYourAnswer', 'caution'),
} as const satisfies Record<string, VerdictRow>);

export type VerdictRowKey = keyof typeof VERDICT_TABLE;

/** The fits variants with their own row; any other variant on a fits code gives the base row. */
const FITS_VARIANTS = ['low_month', 'no_net', 'small_net'] as const;
type FitsVariant = (typeof FITS_VARIANTS)[number];
const isFitsVariant = (v: Variant | null): v is FitsVariant => v !== null && (FITS_VARIANTS as readonly string[]).includes(v);
/** fits_unspent also has extra_savings (D-62) and costly_debt (D-39b). */
const UNSPENT_VARIANTS = [...FITS_VARIANTS, 'extra_savings', 'costly_debt'] as const;
type UnspentVariant = (typeof UNSPENT_VARIANTS)[number];
const isUnspentVariant = (v: Variant | null): v is UnspentVariant => v !== null && (UNSPENT_VARIANTS as readonly string[]).includes(v);

/**
 * Variant-aware lookup. A null variant gives the base row (not_yet defaults to not_covered); low_month, no_net and small_net only
 * apply to fits codes, protection_off only to fits_uses_net. tight (05.4 FIN-07 / D-40) reads the one-off rows when `once` is true:
 * the check is paid once, or it is a D-68 plan judged by cash (its answer carries short_plan_from_cash); else the plan row.
 */
export function verdictRowFor(code: Code, variant: Variant | null, once = false): VerdictRow {
  if (variant === 'tight' && code === 'fits_month') return once ? VERDICT_TABLE['fits_month.tight_once'] : VERDICT_TABLE['fits_month.tight'];
  if (variant === 'tight' && code === 'fits_unspent') return once ? VERDICT_TABLE['fits_unspent.tight'] : VERDICT_TABLE['fits_unspent.tight_plan'];
  // D-63: one row for every answer but an ask.
  if (variant === 'month_already_short' && code !== 'needs_input') return VERDICT_TABLE[`${code}.month_already_short` as const];
  // D-65: the Small and Moderate tiers are on a cash fit only; Moderate from extra savings on fits_unspent only.
  if ((variant === 'month_short_small' || variant === 'month_short_moderate') && (code === 'fits_month' || code === 'fits_unspent' || code === 'fits_by_borrowing')) {
    return VERDICT_TABLE[`${code}.${variant}` as const];
  }
  if (variant === 'month_short_moderate_extra' && (code === 'fits_unspent' || code === 'fits_by_borrowing')) return VERDICT_TABLE[`${code}.month_short_moderate_extra` as const];
  switch (code) {
    case 'fits_month':
      return isFitsVariant(variant) ? VERDICT_TABLE[`fits_month.${variant}` as const] : VERDICT_TABLE.fits_month;
    case 'fits_unspent':
      return isUnspentVariant(variant) ? VERDICT_TABLE[`fits_unspent.${variant}` as const] : VERDICT_TABLE.fits_unspent;
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
    case 'fits_on_your_answer':
      return VERDICT_TABLE.fits_on_your_answer;
    case 'fits_by_borrowing':
      return variant === 'borrowing_costs_more' ? VERDICT_TABLE['fits_by_borrowing.borrowing_costs_more'] : VERDICT_TABLE.fits_by_borrowing;
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
  pay_gap: 'decide.v3.notice.pay_gap', // 05.4 FIN-15
  tax_not_included: 'decide.v3.notice.tax_not_included', // 05.4 FIN-27 (D-20)
  account_no_rate: 'decide.v3.notice.account_no_rate', // 05.4 ENG-17 (D-114)
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
  extra_savings_used: 'decide.v3.fact.extra_savings_used',
  net_two_months: 'decide.v3.fact.net_two_months',
  move_money_by: 'decide.v3.fact.move_money_by',
  usual_month_short: 'decide.v3.fact.usual_month_short',
  depletion_payment: 'decide.v3.fact.depletion_payment',
  plan_makes_short: 'decide.v3.fact.plan_makes_short',
  price_over_net: 'decide.v3.fact.price_over_net',
  net_lasts: 'decide.v3.fact.net_lasts',
  net_lasts_without: 'decide.v3.fact.net_lasts_without',
  interest_is_a_cost: 'decide.v3.fact.interest_is_a_cost',
  balanced_month_room: 'decide.v3.fact.balanced_month_room',
  month_balance_gap: 'decide.v3.fact.month_balance_gap',
  month_short_fits: 'decide.v3.fact.month_short_fits',
  money_lasts_shorter: 'decide.v3.fact.money_lasts_shorter',
  short_plan_from_cash: 'decide.v3.fact.short_plan_from_cash', // 05.4 D-68
  // 05.4 FIN-04 / FIN-10 / FIN-14 (05.4-20; D-08, D-39b, D-43)
  debt_interest_cost: 'decide.v3.fact.debt_interest_cost',
  debt_more: 'decide.v3.fact.debt_more',
  housing_cost: 'decide.v3.fact.housing_cost',
  joint_loan_risk: 'decide.v3.fact.joint_loan_risk',
  debt_due_day_assumed: 'decide.v3.fact.debt_due_day_assumed',
  card_instead: 'decide.v3.fact.card_instead',
  ask_debts_not_recorded: 'decide.v3.fact.ask_debts_not_recorded',
  tight_floor: 'decide.v3.fact.tight_floor', // 05.4 FIN-07 / D-40
  save_vs_borrow: 'decide.v3.fact.save_vs_borrow', // 05.4 FIN-05
  net_covers_surprises: 'decide.v3.fact.net_covers_surprises', // 05.4 D-48
  income_or_costs_first: 'decide.v3.fact.income_or_costs_first', // 05.4 D-48 (shared with D-46)
  covered_from_savings: 'decide.v3.fact.covered_from_savings', // 05.4 D-46 (05.4-23)
  further_shortfall_runway: 'decide.v3.fact.further_shortfall_runway', // 05.4 D-46 (05.4-23)
  earlier_money_from: 'decide.v3.fact.earlier_money_from', // 05.4 D-44 (05.4-24)
  overdraft_carried_in: 'decide.v3.fact.overdraft_carried_in', // 05.4 D-86 (05.4-24 FIN-09b)
  tax_estimate: 'decide.v3.fact.tax_estimate', // 05.4 FIN-27 (D-19, CMP-F24)
  debt_left_after_sale: 'decide.v3.fact.debt_left_after_sale', // 05.4 BO-05 (05.4-27, D-106)
  sale_counted: 'decide.v3.fact.sale_counted', // 05.4 BO-05 (05.4-27, D-106)
} as const satisfies Record<FactCode, string>);

/**
 * 05.4 FIN-27 (CMP-F24, D-21): fixed tax and example-rate lines the screens show (08.1). disclaimer: "a planning estimate, not a
 * tax figure" (owner, D-92; no exception in the copy guards); exampleRate labels an example loan or mortgage rate, which is never stored as the
 * user's rate and never used in the sums (no default APR exists, 05.1 D-07, ARC-25).
 */
export const TAX_KEYS = Object.freeze({
  disclaimer: 'decide.v3.tax.disclaimer',
  exampleRate: 'decide.v3.tax.exampleRate',
});

/**
 * 05.4 FIN-09 / UX-02 (05.4-24, D-22): the after-purchase lines. A figure below 0 reads the Over line (D-106: overspent); the
 * answer's afterBuy.lead says whether this month or the usual month leads (screens in 08.1).
 */
export const AFTER_BUY_KEYS = Object.freeze({
  month: 'decide.v3.afterBuy.month',
  monthOver: 'decide.v3.afterBuy.monthOver',
  usualMonth: 'decide.v3.afterBuy.usualMonth',
  usualMonthOver: 'decide.v3.afterBuy.usualMonthOver',
  // 05.4 D-42 (05.4-26): when it is to be bought (Result.purchaseDate): boughtToday when it equals the check date, else boughtOn
  // {{date}}. The line's placement is 08.1.
  boughtOn: 'decide.v3.afterBuy.boughtOn',
  boughtToday: 'decide.v3.afterBuy.boughtToday',
});

/**
 * 05.4 FIN-03 (D-38): the answers a fact offers. no_overdraft_limit asks whether the account has an overdraft; both actions open
 * the account's settings (the fact carries accountId). Screens are 08.1.
 */
export const FACT_ACTION_KEYS = Object.freeze({
  no_overdraft_limit: { addLimit: 'decide.v3.factAction.addLimit', noOverdraft: 'decide.v3.factAction.noOverdraft' },
  // 05.4 FIN-04 (DB-02): opens the debt's settings. D-43 (QE-01, QE-13): ask, don't block.
  debt_due_day_assumed: { setDueDay: 'decide.v3.factAction.setDueDay' },
  ask_debts_not_recorded: { addIt: 'decide.v3.factAction.addIt', none: 'decide.v3.factAction.none' },
} as const satisfies Partial<Record<FactCode, Readonly<Record<string, string>>>>);

export const MISSING_KEYS = Object.freeze({
  no_income_figures: 'decide.v3.missing.no_income_figures',
  unspent_not_confirmed: 'decide.v3.missing.unspent_not_confirmed',
  records_look_behind: 'decide.v3.missing.records_look_behind',
  no_price: 'decide.v3.missing.no_price',
  price_too_large: 'decide.v3.missing.price_too_large', // 05.4 ENG-15 (D-109)
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
  // 05.4 FIN-08 (05.4-23): source 'savings' | 'net' picks the variant; times low months over the term's payments (QE-04).
  lean_bridge: ['source', 'month', 'shortfall', 'times', 'payments', 'until', 'bridge', 'savings'],
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
  // 05.4 D-56 / D-62: the extra savings used, of the money above the net's size; 2 months of essential costs. D-58: amount and date.
  extra_savings_used: ['used', 'above'],
  net_two_months: ['twoMonths'],
  move_money_by: ['amount', 'date'],
  // 05.4 D-54 / D-60 / D-63: the depletion lines.
  usual_month_short: ['short'],
  depletion_payment: ['monthly', 'shortBefore', 'shortAfter'],
  plan_makes_short: ['short'],
  price_over_net: ['price', 'net'],
  net_lasts: ['shortfall', 'months'],
  net_lasts_without: ['months'],
  interest_is_a_cost: ['interest', 'total'],
  balanced_month_room: ['pay', 'costs'],
  month_balance_gap: ['gap'],
  month_short_fits: ['price', 'money', 'short'],
  money_lasts_shorter: ['months', 'monthsAfter'],
  short_plan_from_cash: ['monthly'], // 05.4 D-68
  // 05.4 FIN-04 / FIN-10 / FIN-14. apr is readable decimal text ("24.9"); share is a whole percent; debtId resolves to the debt's
  // name; kind picks the ask's copy variant ('all', or the missing ones: 'loan', 'card', 'overdraft', joined by '_').
  debt_interest_cost: ['balance', 'apr', 'monthlyInterest'],
  debt_more: ['count'],
  housing_cost: ['amount', 'pay', 'share'],
  joint_loan_risk: [],
  debt_due_day_assumed: ['debtId', 'amount'],
  card_instead: ['price', 'saved'],
  ask_debts_not_recorded: ['kind'],
  // 05.4 FIN-07 / D-40: basis picks the copy ('tenth', or 'user_line' for the _user_line copy).
  tight_floor: ['floor', 'basis'],
  // 05.4 FIN-05 (D-07, D-39a): kind picks the copy ('cash_fits' { left, more }, 'ready' { readyBy, more }, 'with_net',
  // 'with_overdraft' or 'no_date' { more });
  // readyBy is a date ('YYYY-MM-DD') or a month ('YYYY-MM'). D-48: the two borrowing lines carry no values.
  // D-79: kind 'ask' { missing }: the missing figure's code, resolved to its name by the screen (COPY_RESOLVERS).
  save_vs_borrow: ['kind', 'left', 'readyBy', 'more', 'missing'],
  net_covers_surprises: [],
  income_or_costs_first: [],
  covered_from_savings: ['savings', 'gap', 'covered', 'of'], // 05.4 D-46
  further_shortfall_runway: ['extra', 'covered', 'of'], // 05.4 D-46
  earlier_money_from: ['amount', 'where'], // 05.4 D-44: where 'account' | 'savings' picks the copy variant
  overdraft_carried_in: ['month', 'amount'], // 05.4 D-86: month is last month
  debt_left_after_sale: ['amount'], // 05.4 BO-05 (05.4-27): what is still owed on the debt after the sale pays part of it
  sale_counted: ['amount', 'date'], // 05.4 BO-05 (05.4-27): the sale the answer counts, and the day it arrives
  tax_estimate: ['percent', 'amount', 'basis'], // 05.4 FIN-27: percent is readable decimal text ("9.03"); amount is the whole tax; basis names the source's kind of rate
});

export const NOTICE_VALUE_KEYS: Readonly<Record<NoticeCode, readonly string[]>> = Object.freeze({
  typical_short: ['short'], // positive
  month_heading_short: ['month', 'short', 'categoryId', 'largest'], // categoryId and largest are omitted with no largest line
  unspent_stale: ['days'],
  unspent_drifted: ['suggested'],
  emergency_not_set: [],
  unsaved_changes: [], // 05.4 APP-02 (D-113): no count; always the first notice
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
  pay_gap: ['setup', 'middle', 'gap'], // 05.4 FIN-15: gap is a percent with one decimal
  tax_not_included: [], // 05.4 FIN-27 (D-20); the screen links to the region setting (08.1)
  account_no_rate: ['account'], // 05.4 ENG-17 (D-114): the account's id; the screen shows its name
});

/** An id the engine emits that the UI resolves to a name; the copy placeholder is the value. */
export const COPY_RESOLVERS = { categoryId: 'category', seriesId: 'bill', envelopeId: 'envelope', accountId: 'account', debtId: 'debt', missing: 'figure' } as const; // missing: 05.4 D-79, a MissingCode named by its decide.v3.missing copy

/** Keys that pick a copy variant or identify a line; they need no placeholder of their own. */
export const DISCRIMINATOR_KEYS = ['lineId', 'kind', 'unit', 'source', 'basis', 'where'] as const; // where: 05.4 D-44 earlier_money_from

/** D-48, D-49, D-54, D-58: a missing code's copy reads its placeholder values from this notice. */
export const MISSING_VALUE_SOURCE = {
  volatile_cover_question: 'income_volatile',
  unexplained_money_question: 'unexplained_money',
  account_use_question: 'account_use_unknown',
  pay_arrival_question: 'pay_not_seen',
} as const satisfies Partial<Record<MissingCode, NoticeCode>>;

/**
 * 05.4 D-64 (05.4-37): under every answer, the caveat line, the link to the About sheet and the footer. They sit outside en.decide
 * (legal.*), like the footer they replace (legal.decideFooter, owner wording 2026-10-26). Placement is 08.1.
 */
export const DISCLAIMER_KEYS = Object.freeze({
  caveat: 'legal.decideAnswer.caveat',
  cantSeeLink: 'legal.decideAnswer.cantSeeLink',
  footer: 'legal.decideAnswer.footer',
} as const);
export const FOOTER_KEY = DISCLAIMER_KEYS.footer;

/** 05.4 D-64 (3): the "About this answer" sheet, in reading order. Its "For this answer" list reads Result.caveats (CAVEAT_KEYS). */
export const ABOUT_KEYS = Object.freeze({
  title: 'legal.decideAbout.title',
  forThisTitle: 'legal.decideAbout.forThisTitle',
  usesTitle: 'legal.decideAbout.usesTitle',
  uses: ['legal.decideAbout.uses.records', 'legal.decideAbout.uses.answers'],
  cantSeeTitle: 'legal.decideAbout.cantSeeTitle',
  cantSee: [
    'legal.decideAbout.cantSee.notAdded',
    'legal.decideAbout.cantSee.owed',
    'legal.decideAbout.cantSee.changesAhead',
    'legal.decideAbout.cantSee.oneOffs',
    'legal.decideAbout.cantSee.household',
    'legal.decideAbout.cantSee.timing',
    'legal.decideAbout.cantSee.outOfDate',
    'legal.decideAbout.cantSee.estimates',
    'legal.decideAbout.cantSee.mistakes',
    'legal.decideAbout.cantSee.beyondMoney',
  ],
  howFarTitle: 'legal.decideAbout.howFarTitle',
  howFar: ['legal.decideAbout.howFar.everyday', 'legal.decideAbout.howFar.wrongFigures'],
  whatTitle: 'legal.decideAbout.whatTitle',
  what: ['legal.decideAbout.what.tool', 'legal.decideAbout.what.notAdvice', 'legal.decideAbout.what.yours'],
  termsLink: 'legal.decideAbout.termsLink',
} as const);

/** 05.4 D-120: the one-time "How Decide answers" card before the first answer (screen and stored acknowledgement 08.1). */
export const INTRO_KEYS = Object.freeze({
  title: 'legal.decideIntro.title',
  lines: ['legal.decideIntro.works', 'legal.decideIntro.figures', 'legal.decideIntro.facts'],
  gotIt: 'legal.decideIntro.gotIt',
} as const);
