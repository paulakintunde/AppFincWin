import { assert, property, string } from 'fast-check';
import type { CustomItemType, CustomOptions, OwnQuestion, PresetPurpose } from '../../types';
import { canUseEmergency, resolveCadence, resolveIncomeKind, resolveItemType, validateCustomOptions } from '../options';
import { PRESET_QUESTIONS } from '../presetQuestions';

const EMPTY: CustomOptions = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] };
const own = (id: string, over: Partial<OwnQuestion> = {}): OwnQuestion => ({ id, label: 'Label', cadence: 'monthly', cash: true, ...over });
const itemType = (id: string, over: Partial<CustomItemType> = {}): CustomItemType => ({ id, base: 'vehicle', questionIds: [], ownQuestions: [], ...over });
const many = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe('canUseEmergency', () => {
  it('I38 / D-19 emergency purposes', () => {
    expect(canUseEmergency(null)).toBe(false);
    expect(canUseEmergency({ kind: 'preset', value: 'necessity' })).toBe(true);
    expect(canUseEmergency({ kind: 'preset', value: 'for_work' })).toBe(true);
    for (const v of ['invest_in_me', 'nice_to_have', 'treat', 'luxury'] as PresetPurpose[]) {
      expect(canUseEmergency({ kind: 'preset', value: v })).toBe(false);
    }
    assert(property(string(), (id) => canUseEmergency({ kind: 'custom', id }) === false));
  });
});

describe('validateCustomOptions', () => {
  it('accepts empty and 10 of each', () => {
    expect(validateCustomOptions(EMPTY)).toEqual([]);
    const ten: CustomOptions = {
      itemTypes: many(10, (i) => itemType(`t${i}`, { ownQuestions: [own(`a${i}`), own(`b${i}`), own(`c${i}`, { cadence: 'one_off' })] })),
      purposes: many(10, (i) => ({ id: `p${i}` })),
      cadences: many(10, (i) => ({ unit: 'week', every: i + 1 })),
      incomeKinds: many(10, (i) => ({ id: `k${i}`, countsAs: null })),
    };
    expect(validateCustomOptions(ten)).toEqual([]);
  });

  it('D-19 limits', () => {
    expect(validateCustomOptions({ ...EMPTY, itemTypes: many(11, (i) => itemType(`t${i}`)) })).toContain('too_many_item_types');
    expect(validateCustomOptions({ ...EMPTY, purposes: many(11, (i) => ({ id: `p${i}` })) })).toContain('too_many_purposes');
    expect(validateCustomOptions({ ...EMPTY, cadences: many(11, () => ({ unit: 'month', every: 2 })) })).toContain('too_many_cadences');
    expect(validateCustomOptions({ ...EMPTY, incomeKinds: many(11, (i) => ({ id: `k${i}`, countsAs: null })) })).toContain('too_many_income_kinds');
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { ownQuestions: many(4, (i) => own(`q${i}`)) })] })).toContain('too_many_own_questions');
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { ownQuestions: [own('q', { label: '  ' })] })] })).toContain('own_question_invalid');
    const badCadence = own('q', { cadence: 'weekly' as unknown as OwnQuestion['cadence'] });
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { ownQuestions: [badCadence] })] })).toContain('own_question_invalid');
    expect(validateCustomOptions({ ...EMPTY, cadences: [{ unit: 'month', every: 0 }] })).toContain('cadence_out_of_range');
    expect(validateCustomOptions({ ...EMPTY, cadences: [{ unit: 'week', every: 13 }] })).toContain('cadence_out_of_range');
    expect(validateCustomOptions({ ...EMPTY, cadences: [{ unit: 'week', every: 1.5 }] })).toContain('cadence_out_of_range');
  });

  it('rejects duplicate ids and unknown questions', () => {
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t'), itemType('t')] })).toContain('duplicate_id');
    expect(validateCustomOptions({ ...EMPTY, purposes: [{ id: 'p' }, { id: 'p' }] })).toContain('duplicate_id');
    expect(validateCustomOptions({ ...EMPTY, incomeKinds: [{ id: 'k', countsAs: null }, { id: 'k', countsAs: 'kept' }] })).toContain('duplicate_id');
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { ownQuestions: [own('q'), own('q')] })] })).toContain('duplicate_id');
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { questionIds: ['fuel_monthly'], ownQuestions: [own('fuel_monthly')] })] })).toContain('duplicate_id');
    expect(validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { questionIds: ['nope'] })] })).toContain('unknown_question');
  });
});

describe('resolveItemType', () => {
  it('returns preset questions for a preset', () => {
    const r = resolveItemType({ kind: 'preset', value: 'tax' }, EMPTY);
    expect(r).toEqual({ base: 'tax', questionIds: PRESET_QUESTIONS.tax, ownQuestions: [], reasons: [] });
  });

  it('D-19 deletion never breaks', () => {
    const r = resolveItemType({ kind: 'custom', id: 'gone' }, EMPTY);
    expect(r.base).toBe('general');
    expect(r.questionIds).toEqual(PRESET_QUESTIONS.general);
    expect(r.ownQuestions).toEqual([]);
    expect(r.reasons).toEqual(['custom_option_missing']);
    expect(() => resolveCadence(3, EMPTY)).not.toThrow();
    expect(resolveCadence(3, EMPTY)).toEqual({ cadence: { unit: 'month', every: 1 }, reasons: ['custom_option_missing'] });
  });

  it('returns a custom type with existing ticked questions and own specs unchanged', () => {
    const o = own('mine', { cadence: 'yearly', cash: false, label: 'Mine' });
    const c: CustomOptions = { ...EMPTY, itemTypes: [itemType('t', { base: 'property', questionIds: ['deposit', 'nope', 'transfer_tax'], ownQuestions: [o] })] };
    const r = resolveItemType({ kind: 'custom', id: 't' }, c);
    expect(r.base).toBe('property');
    expect(r.questionIds).toEqual(['deposit', 'transfer_tax']);
    expect(r.ownQuestions).toEqual([o]);
    expect(r.reasons).toEqual([]);
  });
});

describe('resolveCadence', () => {
  it('returns a valid custom cadence and falls back on a bad index or value', () => {
    const c: CustomOptions = { ...EMPTY, cadences: [{ unit: 'week', every: 6 }, { unit: 'month', every: 99 }] };
    expect(resolveCadence(0, c)).toEqual({ cadence: { unit: 'week', every: 6 }, reasons: [] });
    expect(resolveCadence(1, c).reasons).toEqual(['custom_option_missing']);
    expect(resolveCadence(-1, c).reasons).toEqual(['custom_option_missing']);
    expect(resolveCadence(0.5, c).reasons).toEqual(['custom_option_missing']);
  });
});

describe('resolveIncomeKind', () => {
  const c: CustomOptions = { ...EMPTY, incomeKinds: [{ id: 'gig', countsAs: 'available' }, { id: 'raw', countsAs: null }] };
  it('explicit line countsAs wins', () => {
    expect(resolveIncomeKind({ kind: 'custom', id: 'gig' }, 'kept', c)).toEqual({ countsAs: 'kept', reasons: [] });
  });
  it('uses the custom kind countsAs', () => {
    expect(resolveIncomeKind({ kind: 'custom', id: 'gig' }, null, c)).toEqual({ countsAs: 'available', reasons: [] });
  });
  it('deleted custom kind counts nothing', () => {
    expect(resolveIncomeKind({ kind: 'custom', id: 'old' }, null, c)).toEqual({ countsAs: null, reasons: ['custom_option_missing'] });
  });
  it('unmarked custom or preset kinds count nothing', () => {
    expect(resolveIncomeKind({ kind: 'custom', id: 'raw' }, null, c)).toEqual({ countsAs: null, reasons: ['income_kind_unmarked'] });
    expect(resolveIncomeKind({ kind: 'preset', value: 'salary' }, null, c)).toEqual({ countsAs: null, reasons: ['income_kind_unmarked'] });
    expect(resolveIncomeKind(null, null, c)).toEqual({ countsAs: null, reasons: [] });
  });
});
