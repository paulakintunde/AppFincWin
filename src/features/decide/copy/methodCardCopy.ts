/**
 * 05-84 (D-79, UI-SPEC R15.1/R15.2): what a step 2 method card says about itself. Pure: keys and params only, no React.
 * `needsFields` lists the terms a method still lacks (from the engine's own plan reasons); `methodSummary` is the folded
 * line, with a missing part left out. Money is integer minor units, formatted by the caller's formatters.
 */
import type { Plan, PlanReason } from '@/engine/decide';
import { isValidAprText, isValidProjectionRateText } from '../snapshot/checkInputs';
import type { CheckInputs, MethodKey, SnapshotResult } from '../snapshot/types';
import { ref, type CopyRef, type Fmt } from './types';

const P = 'decide.pay.';

export type NeedsField = 'price' | 'rate' | 'months' | 'payment' | 'howMany' | 'cardRate' | 'minimumTerms' | 'dealerCap' | 'usdRate' | 'amount';

export interface Needs {
  /** The R15.2 field words, in order. */
  fields: readonly NeedsField[];
  /** True when a field lives on step 1 (price, amount), so the line offers "· Edit". */
  edit: boolean;
}

/** The catalogue key of a field word. */
export function needsFieldKey(field: NeedsField): string {
  return `${P}card.field.${field}`;
}

/** "Needs: rate, months" and the field list alone (for the accessibility label). */
export function needsText(t: (key: string, params?: Record<string, string | number>) => string, needs: Needs): { line: string; fields: string } {
  const fields = needs.fields.map((f) => t(needsFieldKey(f))).join(', ');
  return { line: t(`${P}card.needs`, { fields }), fields };
}

/**
 * The fields a method cannot be scored without, or null when it can be (or nothing is known to be missing). `reasons` are
 * the engine's PlanReason list for a method whose plan did not resolve; they decide every field except the price and
 * the amount, which are read from the inputs.
 */
export function needsFields(method: MethodKey, reasons: readonly PlanReason[], inputs: CheckInputs): Needs | null {
  const has = (r: PlanReason) => reasons.includes(r);
  const priceMissing = inputs.advertised === null || inputs.advertised <= 0;
  const out: NeedsField[] = [];
  switch (method) {
    case 'cash':
      if (priceMissing) out.push('price');
      break;
    case 'loan':
      if (has('loan_apr_missing')) out.push('rate');
      if (has('loan_term_missing')) out.push('months');
      break;
    case 'instalment':
      if (inputs.instalment.hasRate === true) {
        if (has('instalment_count_missing')) out.push('howMany');
        if (has('instalment_rate_missing')) out.push('rate');
      } else {
        if (has('instalment_amount_missing')) out.push('payment');
        if (has('instalment_count_missing')) out.push('howMany');
      }
      break;
    case 'card':
      if (has('card_apr_missing')) out.push('cardRate');
      if (has('card_minimum_terms_missing')) out.push('minimumTerms');
      if (has('dealer_cap_missing')) out.push('dealerCap');
      if (has('card_limit_rate_missing')) out.push('usdRate');
      break;
    case 'lump':
      if (priceMissing) out.push('amount');
      break;
    case 'monthly':
      if (priceMissing) out.push('amount');
      if (has('invest_term_missing') || inputs.investTermMonths === null) out.push('months');
      break;
  }
  if (out.length === 0) return null;
  return { fields: out, edit: out.includes('price') || out.includes('amount') };
}

export interface SummaryArgs {
  method: MethodKey;
  inputs: CheckInputs;
  /** The resolved plan, or null while the method cannot be scored. */
  plan: Plan | null;
  /** The cash the user holds, minor units (Paid in full: "leaves {cash}"). */
  cash: number;
  /** Whole-unit and exact formatters. */
  whole: Fmt;
  exact: Fmt;
  cards: SnapshotResult['cards'];
}

/**
 * The folded summary of R15.2, as parts joined with " · " (see joinPreview); null when nothing can be said yet.
 * A missing part is left out, e.g. "$2,000 down · 36 months".
 */
export function methodSummary({ method, inputs, plan, cash, whole, exact, cards }: SummaryArgs): CopyRef | readonly CopyRef[] | null {
  switch (method) {
    case 'cash':
      return plan === null ? null : ref(`${P}summaryDay`, { price: whole(plan.dayOne), cash: whole(cash - plan.dayOne) });
    case 'loan': {
      const { deposit, termMonths, aprText } = inputs.loan;
      const apr = isValidAprText(aprText);
      if (termMonths !== null && apr) return ref(`${P}summaryLoan`, { deposit: whole(deposit), count: termMonths, apr: aprText });
      const parts: CopyRef[] = [ref(`${P}summaryDown`, { deposit: whole(deposit) })];
      if (termMonths !== null) parts.push(ref(`${P}summaryMonths`, { count: termMonths }));
      if (apr) parts.push(ref(`${P}summaryApr`, { apr: aprText }));
      return parts;
    }
    case 'instalment': {
      const inst = inputs.instalment;
      const payment = inst.amount ?? (inst.hasRate === true && plan !== null ? plan.monthly : null);
      if (inst.count === null || payment === null) return null;
      // D-89 / R16.16 M6: "{count} × {payment} weekly | every 2 weeks | a month | a quarter", then " · no rate" or " · {apr}%",
      // then " · first {when}" when the first payment is not on the day
      const freq = inst.freq ?? 'monthly';
      const parts: CopyRef[] = [ref(`${P}instSummary.${freq}`, { count: inst.count, payment: exact(payment) })];
      if (inst.hasRate !== true) {
        parts.push(ref(`${P}instSummaryNoRate`));
      } else {
        const apr = inst.aprText ?? '';
        if (isValidAprText(apr)) parts.push(ref(`${P}instSummaryRate`, { apr }));
      }
      if ((inst.firstPayment ?? 'today') !== 'today') parts.push(ref(`${P}instSummaryFirst`, undefined, { when: `${P}when.${freq}` }));
      return parts;
    }
    case 'card': {
      const chosen = cards.find((c) => c.accountId === inputs.card.accountId);
      if (chosen === undefined) return null;
      const card = chosen.name;
      if (inputs.card.payoff === 'full') return ref(`${P}summaryCardFull`, { card });
      if (inputs.card.payoff === 'minimum') return ref(`${P}summaryCardMinimum`, { card });
      return ref(`${P}summaryCardMonths`, { card, count: inputs.card.months });
    }
    case 'lump': {
      if (inputs.advertised === null || inputs.advertised <= 0) return null;
      const amount = whole(inputs.advertised);
      const rate = inputs.investReturnText;
      return rate !== null && isValidProjectionRateText(rate) ? ref(`${P}summaryLumpRate`, { amount, rate }) : ref(`${P}summaryLump`, { amount });
    }
    case 'monthly': {
      if (inputs.advertised === null || inputs.advertised <= 0 || inputs.investTermMonths === null) return null;
      return ref(`${P}summaryContribution`, { amount: exact(inputs.advertised), count: inputs.investTermMonths });
    }
  }
}
