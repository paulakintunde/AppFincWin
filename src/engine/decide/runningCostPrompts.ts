/**
 * Running-cost prompts by item type (D-55, DEC-13).
 *
 * The table holds categories only, never amounts (D-05): the user types every amount. Phase 5 pre-lists these in
 * step 2 (05 D-33).
 *
 * D-63: the loss_of_value prompt carries no amount and no rate. The user types an amount per month or a %/year of the
 * advertised price, which 04-06 lossOfValueMonthly converts into the monthly amount of a loss_of_value CostLine.
 * Leaving it blank adds no line; nothing is defaulted.
 *
 * Loss of value is the one non-cash category: it never enters the month test (04-06's netRunningCosts reports it as
 * `nonCash`).
 *
 * The general list (insurance, maintenance, loss of value) is a Claude's-discretion choice recorded in
 * 04-REPLAN-NOTES (2026-10-15 expansion, interpretation 12): a sofa or a laptop can carry insurance, repairs and
 * loss of value.
 */
import { assertNever } from '../guards/assertNever';
import type { ItemType } from './cardRule';
import type { RunningCostCategory } from './types';

export const RUNNING_COST_CATEGORIES: readonly RunningCostCategory[] = Object.freeze([
  'insurance',
  'fuel',
  'maintenance',
  'registration',
  'loss_of_value',
] as const);

export const RUNNING_COST_PROMPTS = Object.freeze({
  vehicle: Object.freeze(['insurance', 'fuel', 'maintenance', 'registration', 'loss_of_value'] as const),
  rent_bill: Object.freeze([] as const),
  loan_repayment: Object.freeze([] as const),
  tax: Object.freeze([] as const),
  insurance_premium: Object.freeze([] as const),
  general: Object.freeze(['insurance', 'maintenance', 'loss_of_value'] as const),
} as const) satisfies Record<ItemType, readonly RunningCostCategory[]>;

export function runningCostPrompts(itemType: ItemType): readonly RunningCostCategory[] {
  switch (itemType) {
    case 'vehicle':
      return RUNNING_COST_PROMPTS.vehicle;
    case 'rent_bill':
      return RUNNING_COST_PROMPTS.rent_bill;
    case 'loan_repayment':
      return RUNNING_COST_PROMPTS.loan_repayment;
    case 'tax':
      return RUNNING_COST_PROMPTS.tax;
    case 'insurance_premium':
      return RUNNING_COST_PROMPTS.insurance_premium;
    case 'general':
      return RUNNING_COST_PROMPTS.general;
    default:
      return assertNever(itemType, 'itemType');
  }
}

export function isNonCashCategory(category: RunningCostCategory): boolean {
  return category === 'loss_of_value';
}
