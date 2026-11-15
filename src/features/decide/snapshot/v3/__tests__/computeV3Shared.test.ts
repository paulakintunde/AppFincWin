// 06.1-46 (G-2, audit B-1, B-2): the empty-check evaluation is judged once per prepared entry and shared by every hook; the
// waiting-write count is laid over at judge time and gives the same Result as a full rebuild with that count.
import type { CheckV2 } from '@/engine/decide/v3';
import { carInputs, demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3, emptyCheckEvaluation, preparedV3, withUnsaved } from '../computeV3';
import { v3s } from './v3Fixtures';

const judged: unknown[] = [];
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    judgeCheck: (p: unknown, c: unknown) => {
      judged.push(c);
      return actual.judgeCheck(p, c);
    },
  };
});

const TODAY = '2026-10-03';
beforeEach(() => {
  judged.length = 0;
});

describe('emptyCheckEvaluation (B-1)', () => {
  it('judges once per prepared entry and returns the same evaluation object', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const a = emptyCheckEvaluation(source, v3);
    const b = emptyCheckEvaluation(source, v3);
    expect(judged).toHaveLength(1);
    expect(b).toBe(a);
  });

  it('equals the full computeV3 of an empty check', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    expect(emptyCheckEvaluation(source, v3).result).toEqual(computeV3(source, v3, {}).result);
  });

  it('another settings source is another entry', () => {
    const source = demoSource(TODAY);
    emptyCheckEvaluation(source, v3s({}));
    emptyCheckEvaluation(source, v3s({}));
    expect(judged).toHaveLength(2);
  });
});

describe('withUnsaved: the waiting-write count laid over at judge time (B-2)', () => {
  const actual = jest.requireActual('@/engine/decide/v3') as typeof import('@/engine/decide/v3');

  it('returns the same Prepared when the count matches, and a copy with only the count changed otherwise', () => {
    const p = preparedV3(demoSource(TODAY), v3s({ income_types: ['salary'] })).prepared;
    expect(withUnsaved(p, 0)).toBe(p);
    const two = withUnsaved(p, 2);
    expect(two).not.toBe(p);
    expect(two.inputs.unsavedWrites).toBe(2);
    expect({ ...two, inputs: { ...two.inputs, unsavedWrites: 0 } }).toEqual(p);
  });

  it.each([
    ['a cash check', sofaInputs],
    ['a plan check', carInputs],
  ])('%s judged on the overlay equals a full rebuild with the same count', (_name, stored) => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const inputs0 = buildV3Inputs(source, v3);
    const check = actual.readStoredCheck(stored).check as CheckV2;
    const overlay = actual.judgeCheck(withUnsaved(actual.prepare(inputs0), 2), check).result;
    const rebuilt = actual.judgeCheck(actual.prepare({ ...inputs0, unsavedWrites: 2 }), check).result;
    expect(overlay).toEqual(rebuilt);
    expect(overlay.notices[0]).toEqual({ code: 'unsaved_changes', values: {} });
    // and through computeV3: the live count equals a source that carried it
    expect(computeV3(source, v3, stored, undefined, null, 2).result).toEqual(computeV3({ ...source, unsavedWrites: 2 }, v3, stored).result);
  });

  it('the empty-check evaluation is held per count and carries the notice only while writes wait', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const none = emptyCheckEvaluation(source, v3);
    const one = emptyCheckEvaluation(source, v3, 1);
    expect(emptyCheckEvaluation(source, v3, 1)).toBe(one);
    expect(emptyCheckEvaluation(source, v3, 0)).toBe(none);
    expect(none.result.notices.some((n) => n.code === 'unsaved_changes')).toBe(false);
    expect(one.result.notices[0]).toEqual({ code: 'unsaved_changes', values: {} });
  });
});
