/**
 * Plan 05.2-32 (DSU-04): the rows on the setup Summary, as a pure view of engine output and the user's own setup
 * answers. No React, no clock, no arithmetic on money: every figure is read straight off the evaluation (the same
 * numbers Decide home shows), so the Summary can never disagree with the check. Formatting and wording are the
 * screen's job; this returns amounts in minor units and i18n keys only.
 */
import type { Evaluation } from '@/engine/decide/v3';

export type SummaryEvaluation = {
  readonly month: Pick<Evaluation['month'], 'month' | 'moneyIn' | 'moneyOut' | 'monthLeft' | 'e'>;
  readonly funds: Pick<Evaluation['funds'], 'unspent' | 'suggested' | 'emergency' | 'envelopesSaved'>;
};

export interface SummarySettings {
  readonly income_types: readonly string[] | null;
  readonly variable_method: 'match' | 'spread' | 'steady' | 'balance' | null;
}

export type SummaryRow =
  | { readonly key: 'month'; readonly month: string; readonly moneyIn: number; readonly moneyOut: number }
  | { readonly key: 'leave'; readonly amount: number }
  | { readonly key: 'typical'; readonly amount: number }
  /** `checked`: 'today', an ISO date, or null when no figure has been confirmed (the suggested sum is shown alone). */
  | { readonly key: 'unspent'; readonly amount: number; readonly checked: 'today' | string | null }
  | { readonly key: 'emergency'; readonly amount: number | null }
  | { readonly key: 'envelopes'; readonly amount: number }
  | { readonly key: 'income'; readonly wordKeys: readonly string[] };

const INCOME_WORD: Readonly<Record<string, string>> = {
  salary_or_wages: 'income.paid.optionSalary',
  commission_or_tips: 'income.paid.optionCommission',
  freelance: 'income.paid.optionFreelance',
  own_business: 'income.paid.optionBusiness',
  pension_or_benefits: 'income.paid.optionPension',
  none: 'income.paid.optionNone',
};

const METHOD_WORD: Readonly<Record<NonNullable<SummarySettings['variable_method']>, string>> = {
  match: 'decide.setup.summary.methodMatch',
  spread: 'decide.setup.summary.methodSpread',
  steady: 'decide.setup.summary.methodSteady',
  balance: 'decide.setup.summary.methodBalance',
};

/** The user's own income wording: what they said they are paid by, then how changing income is counted. */
export function incomeWordKeys(settings: SummarySettings | null): string[] {
  if (settings === null) return [];
  const words = (settings.income_types ?? []).map((t) => INCOME_WORD[t]).filter((k): k is string => k !== undefined);
  if (settings.variable_method !== null) words.push(METHOD_WORD[settings.variable_method]);
  return words;
}

/** The typical row is the everyday figure the readout and the everyday step show: the user's own figure, else the engine's typical (F-04). */
export function summaryModel(evaluation: SummaryEvaluation, settings: SummarySettings | null, everydayOverride: number | null, today: string): SummaryRow[] {
  const { month, funds } = evaluation;
  const rows: SummaryRow[] = [
    { key: 'month', month: month.month, moneyIn: Number(month.moneyIn), moneyOut: Number(month.moneyOut) },
    { key: 'leave', amount: Number(month.monthLeft) },
  ];
  const typical = everydayOverride ?? (month.e == null ? null : Number(month.e));
  if (typical !== null) rows.push({ key: 'typical', amount: typical });
  if (funds.unspent !== null) {
    const amount = Number(funds.unspent.available ?? funds.unspent.value);
    rows.push({ key: 'unspent', amount, checked: funds.unspent.anchor.at === today ? 'today' : funds.unspent.anchor.at });
  } else {
    rows.push({ key: 'unspent', amount: Number(funds.suggested), checked: null });
  }
  rows.push({ key: 'emergency', amount: funds.emergency === null ? null : Number(funds.emergency) });
  rows.push({ key: 'envelopes', amount: Number(funds.envelopesSaved) });
  const words = incomeWordKeys(settings);
  if (words.length > 0) rows.push({ key: 'income', wordKeys: words });
  return rows;
}
