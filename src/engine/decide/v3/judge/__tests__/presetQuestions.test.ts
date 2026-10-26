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

  it('is frozen', () => {
    expect(Object.isFrozen(PRESET_QUESTIONS)).toBe(true);
    expect(Object.isFrozen(PRESET_QUESTIONS.vehicle)).toBe(true);
    expect(Object.isFrozen(QUESTION_LIBRARY)).toBe(true);
  });
});
