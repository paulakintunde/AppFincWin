/**
 * Exhaustive engine code → catalogue key maps (05-09 Task 1). Each is `as const satisfies Record<Code, string>`, so a code
 * added to the engine without a key here fails the typecheck (DCU-09). Values are `decide.*` keys only.
 */
import type {
  AlternativeCode, CashOutcome, ItemType, LedgerCode, LedgerDirection, MissingReason, PurchaseSize, SetbackCode, Steadiness, WarningCode,
} from '@/engine/decide';
import type { MethodKey } from '../snapshot/types';

/** IN-B07: the defensive line when a verdict's lead warning is unexpectedly missing; never a zero-amount claim. */
export const UNEXPLAINED = 'decide.verdict.titleUnexplained';

export const SIZE_LABEL = {
  from_spare_this_month: 'decide.size.from_spare_this_month',
  from_savings: 'decide.size.from_savings',
  needs_spreading: 'decide.size.needs_spreading',
} as const satisfies Record<PurchaseSize, string>;

export const MISSING_TITLE = {
  card_not_accepted: 'decide.verdict.missing.card_not_accepted',
  card_missing: 'decide.verdict.missing.card_missing',
  card_apr_missing: 'decide.verdict.missing.card_apr_missing',
  card_minimum_terms_missing: 'decide.verdict.missing.card_minimum_terms_missing',
  dealer_cap_missing: 'decide.verdict.missing.dealer_cap_missing',
  loan_term_missing: 'decide.verdict.missing.loan_term_missing',
  loan_apr_missing: 'decide.verdict.missing.loan_apr_missing',
  instalment_amount_missing: 'decide.verdict.missing.instalment_amount_missing',
  instalment_count_missing: 'decide.verdict.missing.instalment_count_missing',
  instalment_rate_missing: 'decide.verdict.missing.instalment_rate_missing',
  instalment_total_below_price: 'decide.verdict.missing.instalment_total_below_price',
  invest_term_missing: 'decide.verdict.missing.invest_term_missing',
  no_full_month: 'decide.verdict.missing.no_full_month',
  split_weights_zero: 'decide.verdict.missing.split_weights_zero',
  split_amounts_zero: 'decide.verdict.missing.split_amounts_zero',
  projection_rate_out_of_range: 'decide.verdict.missing.projection_rate_out_of_range',
} as const satisfies Record<MissingReason, string>;

export const LEDGER_LABEL = {
  income: 'decide.section.ledger.income',
  expenses: 'decide.section.ledger.expenses',
  debt: 'decide.section.ledger.debt',
  cash: 'decide.section.ledger.cash',
  investments: 'decide.section.ledger.investments',
} as const satisfies Record<LedgerCode, string>;

export const LEDGER_DESC = {
  income: 'decide.section.ledgerDesc.income',
  expenses: 'decide.section.ledgerDesc.expenses',
  debt: 'decide.section.ledgerDesc.debt',
  cash: 'decide.section.ledgerDesc.cash',
  investments: 'decide.section.ledgerDesc.investments',
} as const satisfies Record<LedgerCode, string>;

export const DIRECTION_LABEL = {
  better: 'decide.section.direction.better',
  worse: 'decide.section.direction.worse',
  same: 'decide.section.direction.same',
} as const satisfies Record<LedgerDirection, string>;

export const SETBACK_LABEL = {
  unexpected_expense: 'decide.section.setback.unexpected_expense',
  income_drop: 'decide.section.setback.income_drop',
  job_loss: 'decide.section.setback.job_loss',
  late_invoice: 'decide.section.setback.late_invoice',
} as const satisfies Record<SetbackCode, string>;

export const CASH_OUTCOME = {
  absorbed: 'decide.section.outcome.absorbed',
  through_cushion: 'decide.section.outcome.through_cushion',
  wiped_out: 'decide.section.outcome.wiped_out',
} as const satisfies Record<CashOutcome, string>;

export const STEADINESS_LABEL = {
  steady: 'decide.steadiness.steady',
  variable: 'decide.steadiness.variable',
  volatile: 'decide.steadiness.volatile',
  insufficient: 'decide.steadiness.insufficient',
} as const satisfies Record<Steadiness, string>;

export const ITEM_TYPE_LABEL = {
  general: 'decide.item.itemType.general',
  vehicle: 'decide.item.itemType.vehicle',
  rent_bill: 'decide.item.itemType.rent_bill',
  loan_repayment: 'decide.item.itemType.loan_repayment',
  tax: 'decide.item.itemType.tax',
  insurance_premium: 'decide.item.itemType.insurance_premium',
} as const satisfies Record<ItemType, string>;

export const METHOD_LABEL = {
  cash: 'decide.method.cash',
  loan: 'decide.method.loan',
  instalment: 'decide.method.instalment',
  card: 'decide.method.card',
  lump: 'decide.method.lump',
  monthly: 'decide.method.monthly',
} as const satisfies Record<MethodKey, string>;

export const ALT_ROW_NAME = {
  as_planned: 'decide.alt.row.as_planned',
  cheaper: 'decide.alt.row.cheaper',
  wait_and_save: 'decide.alt.row.wait_and_save',
  skip: 'decide.alt.row.skip',
} as const satisfies Record<AlternativeCode, string>;

export const WARNING_TITLE = {
  month: 'decide.warn.monthTitle',
  cash: 'decide.warn.cashTitle',
  cash_dip: 'decide.warn.cashDipTitle',
  dsr: 'decide.warn.dsrTitle',
  owe: 'decide.warn.oweTitle',
  inv: 'decide.warn.invTitleInvesting',
} as const satisfies Record<WarningCode, string>;

// cash_dip is upgraded to 'hard' by warningCard when assessment.cashDip is 'hard' (04 D-44)
export const WARNING_TONE = {
  month: 'hard',
  owe: 'hard',
  cash: 'soft',
  cash_dip: 'soft',
  dsr: 'soft',
  inv: 'soft',
} as const satisfies Record<WarningCode, 'hard' | 'soft'>;
