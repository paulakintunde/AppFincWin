import type { CustomItemType, CustomOptions, OwnQuestion } from '../../types';
import { resolveCadence, validateCustomOptions } from '../options';

const EMPTY: CustomOptions = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] };
const own = (id: string, over: Partial<OwnQuestion> = {}): OwnQuestion => ({ id, label: 'Label', cadence: 'monthly', cash: true, ...over });
const itemType = (id: string, over: Partial<CustomItemType> = {}): CustomItemType => ({ id, base: 'vehicle', questionIds: [], ownQuestions: [], ...over });

// 05.4-59: boundary cases that each pin one operand of the validators.
describe('05.4-59 option validation boundaries', () => {
  const withOwn = (o: OwnQuestion) => validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { ownQuestions: [o] })] });
  const withCadence = (c: { unit: 'week' | 'month'; every: number }) => validateCustomOptions({ ...EMPTY, cadences: [c] });

  it('each own-question cadence is valid on its own', () => {
    for (const cadence of ['monthly', 'yearly', 'one_off'] as const) expect(withOwn(own('q', { cadence }))).toEqual([]);
    expect(withOwn(own('q', { cadence: '' as unknown as OwnQuestion['cadence'] }))).toEqual(['own_question_invalid']);
  });
  it('each own-question rule alone flags it, and a fully valid one does not', () => {
    expect(withOwn(own('q', { label: '' }))).toEqual(['own_question_invalid']);
    expect(withOwn(own('q', { label: ' x ' }))).toEqual([]);
    expect(withOwn(own('q', { cash: 'yes' as unknown as boolean }))).toEqual(['own_question_invalid']);
    expect(withOwn(own('q', { cash: false }))).toEqual([]);
  });
  it('cadence unit and every bounds', () => {
    expect(withCadence({ unit: 'week', every: 1 })).toEqual([]);
    expect(withCadence({ unit: 'week', every: 12 })).toEqual([]);
    expect(withCadence({ unit: 'month', every: 1 })).toEqual([]);
    expect(withCadence({ unit: 'month', every: 12 })).toEqual([]);
    expect(withCadence({ unit: 'month', every: 13 })).toEqual(['cadence_out_of_range']);
    expect(withCadence({ unit: 'week', every: 0 })).toEqual(['cadence_out_of_range']);
    expect(withCadence({ unit: 'day' as unknown as 'week', every: 2 })).toEqual(['cadence_out_of_range']);
  });
  it('a known question id is not flagged; an unknown one is', () => {
    const k = (questionIds: string[]) => validateCustomOptions({ ...EMPTY, itemTypes: [itemType('t', { questionIds: questionIds as never })] });
    expect(k(['fuel_monthly'])).toEqual([]);
    expect(k(['nope'])).toEqual(['unknown_question']);
  });
  it('resolveCadence index guards', () => {
    const c: CustomOptions = { ...EMPTY, cadences: [{ unit: 'week', every: 2 }, { unit: 'month', every: 99 }] };
    expect(resolveCadence(0, c)).toEqual({ cadence: { unit: 'week', every: 2 }, reasons: [] });
    expect(resolveCadence(1, c).reasons).toEqual(['custom_option_missing']);
    expect(resolveCadence(-1, c)).toEqual({ cadence: { unit: 'month', every: 1 }, reasons: ['custom_option_missing'] });
    expect(resolveCadence(0.5, c).reasons).toEqual(['custom_option_missing']);
    expect(resolveCadence(5, c).reasons).toEqual(['custom_option_missing']);
  });
});
