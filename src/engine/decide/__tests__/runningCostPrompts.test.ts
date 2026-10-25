import { ITEM_TYPES } from '../cardRule';
import * as mod from '../runningCostPrompts';
import {
  RUNNING_COST_CATEGORIES,
  RUNNING_COST_PROMPTS,
  isNonCashCategory,
  runningCostPrompts,
} from '../runningCostPrompts';

describe('running-cost prompts (D-55)', () => {
  it('vehicle lists the five categories in order', () => {
    expect(RUNNING_COST_PROMPTS.vehicle).toEqual(['insurance', 'fuel', 'maintenance', 'registration', 'loss_of_value']);
  });

  it('general lists insurance, maintenance and loss of value', () => {
    expect(RUNNING_COST_PROMPTS.general).toEqual(['insurance', 'maintenance', 'loss_of_value']);
  });

  it.each(['rent_bill', 'loan_repayment', 'tax', 'insurance_premium', 'cash_equivalent'] as const)('%s has no prompts', (t) => {
    expect(RUNNING_COST_PROMPTS[t]).toEqual([]);
  });

  it('is exhaustive over ItemType and uses known categories', () => {
    expect(Object.keys(RUNNING_COST_PROMPTS).sort()).toEqual([...ITEM_TYPES].sort());
    for (const list of Object.values(RUNNING_COST_PROMPTS)) {
      for (const c of list) expect(RUNNING_COST_CATEGORIES).toContain(c);
    }
  });

  it('runningCostPrompts returns the table entry and rejects unknown types', () => {
    for (const t of ITEM_TYPES) expect(runningCostPrompts(t)).toBe(RUNNING_COST_PROMPTS[t]);
    expect(() => runningCostPrompts('boat' as never)).toThrow('Unhandled itemType: "boat"');
  });

  it('only loss_of_value is non-cash', () => {
    expect(isNonCashCategory('loss_of_value')).toBe(true);
    for (const c of ['insurance', 'fuel', 'maintenance', 'registration', 'property_tax', 'home_insurance', 'utilities', 'service_charge', 'books_materials', 'travel', 'accommodation'] as const) {
      expect(isNonCashCategory(c)).toBe(false);
    }
  });

  it('carries categories only: no numbers anywhere in the exports', () => {
    const walk = (v: unknown): void => {
      if (typeof v === 'function') return;
      if (Array.isArray(v)) return v.forEach(walk);
      if (v !== null && typeof v === 'object') return Object.values(v).forEach(walk);
      expect(typeof v).toBe('string');
      expect(v).toMatch(/^[a-z_]+$/);
    };
    walk(RUNNING_COST_CATEGORIES);
    walk(RUNNING_COST_PROMPTS);
    for (const v of Object.values(mod)) expect(typeof v).not.toBe('number');
  });
});
