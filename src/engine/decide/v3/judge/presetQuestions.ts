/**
 * v3 §5.3 preset question sets (05.1, D-19, I36). Questions only, never amounts: the user types every amount; a
 * matching record may be suggested by the UI, never filled in by the engine.
 */
import { ITEM_TYPES, type ItemType } from '../../cardRule';
import type { QuestionId, V3PresetItemType } from '../types';

// Cite: v3 §5.3 (REBUILD-PLAN-v3), Pitfall 10: electronics, subscription and emergency_repair exist only here; ITEM_TYPES is unchanged.
export const V3_ITEM_TYPES = Object.freeze([...ITEM_TYPES, 'electronics', 'subscription', 'emergency_repair'] as const);

export interface QuestionSpec {
  readonly id: QuestionId;
  readonly cadence: 'monthly' | 'yearly' | 'one_off' | 'none';
  readonly cash: boolean;
  readonly answer: 'amount' | 'yes_no' | 'date';
  /** M-08: 'cost' adds to day one, 'credit' lowers it, 'modelled_elsewhere' is never added (another field models it). */
  readonly role: 'cost' | 'credit' | 'modelled_elsewhere';
}

const q = (
  id: string,
  cadence: QuestionSpec['cadence'],
  answer: QuestionSpec['answer'] = 'amount',
  cash = true,
  role: QuestionSpec['role'] = 'cost'
): QuestionSpec => Object.freeze({ id, cadence, cash, answer, role });

// Cite: v3 §5.3 table (REBUILD-PLAN-v3). Categories only; loss_of_value is the one non-cash question (seeded from runningCostPrompts.ts).
export const QUESTION_LIBRARY: readonly QuestionSpec[] = Object.freeze([
  q('insurance_monthly', 'monthly'),
  q('fuel_monthly', 'monthly'),
  q('maintenance_yearly', 'yearly'),
  q('registration_yearly', 'yearly'),
  q('loss_of_value', 'yearly', 'amount', false),
  // Cite: M-08: modelled by CheckV2.taxPercent and PayV2.deposit; the UI routes these answers there (I36).
  q('sales_tax', 'one_off', 'amount', true, 'modelled_elsewhere'),
  q('dealer_fees', 'one_off'),
  q('trade_in', 'one_off', 'amount', true, 'credit'),
  q('deposit', 'one_off', 'amount', true, 'modelled_elsewhere'),
  q('property_tax_yearly', 'yearly'),
  q('home_insurance', 'yearly'),
  q('utilities_change', 'monthly'),
  q('service_charge', 'monthly'),
  q('closing_costs', 'one_off'),
  q('transfer_tax', 'one_off'),
  q('moving_costs', 'one_off'),
  q('rent_stops', 'none', 'yes_no'),
  q('books_materials', 'one_off'),
  q('travel', 'monthly'),
  q('accommodation', 'monthly'),
  q('income_changes', 'none', 'yes_no'),
  q('due_date', 'none', 'date'),
  q('late_penalty', 'one_off'),
  q('instalment_offered', 'none', 'yes_no'),
  q('billed_yearly', 'none', 'yes_no'),
  q('old_premium_stops', 'none', 'yes_no'),
  q('warranty', 'one_off'),
  q('accessories', 'one_off'),
  q('bundled_subscriptions', 'monthly'),
  q('resale', 'one_off'),
  q('joining_fee', 'one_off'),
  q('billing_frequency', 'none'),
  q('cancellation_fee', 'one_off'),
  q('price_after_intro', 'monthly'),
  q('what_broke', 'none'),
  q('repair_or_replace', 'none', 'yes_no'),
  q('cover_insurance', 'none', 'yes_no'),
]);

const set = (a: readonly QuestionId[]): readonly QuestionId[] => Object.freeze([...a]);

// Cite: v3 §5.3 (REBUILD-PLAN-v3).
export const PRESET_QUESTIONS: Readonly<Record<V3PresetItemType, readonly QuestionId[]>> = Object.freeze({
  vehicle: set(['insurance_monthly', 'fuel_monthly', 'maintenance_yearly', 'registration_yearly', 'loss_of_value', 'sales_tax', 'dealer_fees', 'trade_in']),
  property: set(['deposit', 'property_tax_yearly', 'home_insurance', 'maintenance_yearly', 'utilities_change', 'service_charge', 'closing_costs', 'transfer_tax', 'moving_costs', 'rent_stops']),
  tuition: set(['books_materials', 'travel', 'accommodation', 'income_changes']),
  tax: set(['due_date', 'late_penalty', 'instalment_offered']),
  insurance_premium: set(['billed_yearly', 'old_premium_stops']),
  electronics: set(['warranty', 'accessories', 'bundled_subscriptions', 'resale']),
  subscription: set(['joining_fee', 'billing_frequency', 'cancellation_fee', 'price_after_intro']),
  emergency_repair: set(['what_broke', 'repair_or_replace', 'cover_insurance']),
  general: set(['insurance_monthly', 'maintenance_yearly', 'loss_of_value']),
  rent_bill: set([]),
  loan_repayment: set([]),
  cash_equivalent: set([]),
} satisfies Record<V3PresetItemType, readonly QuestionId[]>);

const BY_ID: ReadonlyMap<QuestionId, QuestionSpec> = new Map(QUESTION_LIBRARY.map((s) => [s.id, s]));

export function questionSpec(id: QuestionId): QuestionSpec | null {
  return BY_ID.get(id) ?? null;
}

/** The questions a preset item type asks, in order. */
export function questionsFor(t: V3PresetItemType): readonly QuestionId[] {
  return PRESET_QUESTIONS[t];
}

const NEW_TYPES: ReadonlySet<V3PresetItemType> = new Set<V3PresetItemType>(['electronics', 'subscription', 'emergency_repair']);

/** Pitfall 10: the three v3-only types use the 'general' card rule. */
export function cardItemTypeOf(t: V3PresetItemType): ItemType {
  return NEW_TYPES.has(t) ? 'general' : (t as ItemType);
}
