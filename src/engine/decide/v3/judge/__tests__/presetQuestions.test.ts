import { ITEM_TYPES } from '../../../cardRule';
import { PRESET_QUESTIONS, QUESTION_LIBRARY, V3_ITEM_TYPES, cardItemTypeOf, questionSpec, questionsFor } from '../presetQuestions';
import type { V3PresetItemType } from '../../types';

function hasNumber(v: unknown): boolean {
  if (typeof v === 'number' || typeof v === 'bigint') return true;
  if (Array.isArray(v)) return v.some(hasNumber);
  if (v && typeof v === 'object') return Object.values(v).some(hasNumber);
  return false;
}

describe('presetQuestions', () => {
  it('I36 presets carry no amounts', () => {
    expect(hasNumber(QUESTION_LIBRARY)).toBe(false);
    expect(hasNumber(PRESET_QUESTIONS)).toBe(false);
  });

  it('every preset id is in the library and every type has a set', () => {
    for (const t of V3_ITEM_TYPES) {
      expect(PRESET_QUESTIONS[t]).toBeDefined();
      for (const id of questionsFor(t)) expect(questionSpec(id)).not.toBeNull();
    }
    expect(V3_ITEM_TYPES).toHaveLength(12);
    expect(questionSpec('nope')).toBeNull();
  });

  it('Pitfall 10 card rule mapping', () => {
    for (const t of ['electronics', 'subscription', 'emergency_repair'] as const) expect(cardItemTypeOf(t)).toBe('general');
    for (const t of ITEM_TYPES) expect(cardItemTypeOf(t as V3PresetItemType)).toBe(t);
    expect(ITEM_TYPES).toHaveLength(9);
  });

  it('library declares cadence and cash', () => {
    for (const s of QUESTION_LIBRARY) {
      expect(['monthly', 'yearly', 'one_off', 'none']).toContain(s.cadence);
      expect(typeof s.cash).toBe('boolean');
    }
    expect(questionSpec('loss_of_value')?.cash).toBe(false);
    expect(questionSpec('fuel_monthly')?.cash).toBe(true);
  });

  it('M-08 roles: trade_in credits, sales_tax and deposit are modelled elsewhere, the rest cost', () => {
    expect(questionSpec('trade_in')?.role).toBe('credit');
    expect(questionSpec('sales_tax')?.role).toBe('modelled_elsewhere');
    expect(questionSpec('deposit')?.role).toBe('modelled_elsewhere');
    expect(questionSpec('dealer_fees')?.role).toBe('cost');
    expect(QUESTION_LIBRARY.filter((s) => s.role !== 'cost')).toHaveLength(3);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PRESET_QUESTIONS)).toBe(true);
    expect(Object.isFrozen(PRESET_QUESTIONS.vehicle)).toBe(true);
    expect(Object.isFrozen(QUESTION_LIBRARY)).toBe(true);
  });
});


describe('presetQuestions exact tables', () => {
  it('library rows, written out literally', () => {
    expect(QUESTION_LIBRARY).toEqual([
    { id: 'insurance_monthly', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'fuel_monthly', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'maintenance_yearly', cadence: 'yearly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'registration_yearly', cadence: 'yearly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'loss_of_value', cadence: 'yearly', cash: false, answer: 'amount', role: 'cost' },
    { id: 'sales_tax', cadence: 'one_off', cash: true, answer: 'amount', role: 'modelled_elsewhere' },
    { id: 'dealer_fees', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'trade_in', cadence: 'one_off', cash: true, answer: 'amount', role: 'credit' },
    { id: 'deposit', cadence: 'one_off', cash: true, answer: 'amount', role: 'modelled_elsewhere' },
    { id: 'property_tax_yearly', cadence: 'yearly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'home_insurance', cadence: 'yearly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'utilities_change', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'service_charge', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'closing_costs', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'transfer_tax', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'moving_costs', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'rent_stops', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'books_materials', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'travel', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'accommodation', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'income_changes', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'due_date', cadence: 'none', cash: true, answer: 'date', role: 'cost' },
    { id: 'late_penalty', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'instalment_offered', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'billed_yearly', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'old_premium_stops', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'warranty', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'accessories', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'bundled_subscriptions', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'resale', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'joining_fee', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'billing_frequency', cadence: 'none', cash: true, answer: 'amount', role: 'cost' },
    { id: 'cancellation_fee', cadence: 'one_off', cash: true, answer: 'amount', role: 'cost' },
    { id: 'price_after_intro', cadence: 'monthly', cash: true, answer: 'amount', role: 'cost' },
    { id: 'what_broke', cadence: 'none', cash: true, answer: 'amount', role: 'cost' },
    { id: 'repair_or_replace', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    { id: 'cover_insurance', cadence: 'none', cash: true, answer: 'yes_no', role: 'cost' },
    ]);
  });

  it('preset sets, written out literally', () => {
    expect(PRESET_QUESTIONS).toEqual({
    vehicle: ['insurance_monthly', 'fuel_monthly', 'maintenance_yearly', 'registration_yearly', 'loss_of_value', 'sales_tax', 'dealer_fees', 'trade_in'],
    property: ['deposit', 'property_tax_yearly', 'home_insurance', 'maintenance_yearly', 'utilities_change', 'service_charge', 'closing_costs', 'transfer_tax', 'moving_costs', 'rent_stops'],
    tuition: ['books_materials', 'travel', 'accommodation', 'income_changes'],
    tax: ['due_date', 'late_penalty', 'instalment_offered'],
    insurance_premium: ['billed_yearly', 'old_premium_stops'],
    electronics: ['warranty', 'accessories', 'bundled_subscriptions', 'resale'],
    subscription: ['joining_fee', 'billing_frequency', 'cancellation_fee', 'price_after_intro'],
    emergency_repair: ['what_broke', 'repair_or_replace', 'cover_insurance'],
    general: ['insurance_monthly', 'maintenance_yearly', 'loss_of_value'],
    rent_bill: [],
    loan_repayment: [],
    cash_equivalent: [],
    });
  });
});
