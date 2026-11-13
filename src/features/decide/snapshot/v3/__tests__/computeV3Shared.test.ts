// 06.1-46 (G-2, audit B-1): the empty-check evaluation is judged once per prepared entry and shared by every hook.
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import { computeV3, emptyCheckEvaluation } from '../computeV3';
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
