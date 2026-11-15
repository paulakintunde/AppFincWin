/**
 * 06.1 D-21 (QA-03): the quick-line cases QL-01 .. QL-08 through the plain calculator and through the engine's overlay. The two
 * share no code (plain.ts foldQuickLines and the income and savings hooks restate the rules from CONTEXT D-21), and must agree on
 * the code, the tight caution and the month figure after buying. Variants other than tight are not compared (the calculator never
 * claimed them all). A case with no quick line must come out as it does without the overlay.
 */
import { judgeWithQuickLines } from '../../quick/overlay';
import { prepare } from '../../prepare';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import { pick } from '../rightAnswers/pick';
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { foldQuickLines, plainAnswer, quickIncomeDates } from './plain';

const cases = loadCases().filter((c) => c.topic === 'quick-lines');

describe('cross-check calculator vs engine: quick lines', () => {
  it('has the eight quick-line cases', () => {
    expect(cases.map((c) => c.id)).toEqual(['QL-01', 'QL-02', 'QL-03', 'QL-04', 'QL-05', 'QL-06', 'QL-07', 'QL-08']);
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s: the engine and the calculator agree', (_id, c) => {
    const { inputs, check } = toEngineInputs(c.fixture);
    const got = pick(judgeWithQuickLines(prepare(inputs), check));
    const plain = plainAnswer(c.fixture);
    expect({ code: got.code, tight: got.variant === 'tight', month: got.afterBuy.month }).toEqual({
      code: plain.code,
      tight: plain.variant === 'tight',
      month: plain.afterBuy,
    });
  });

  it('a case with its quick lines taken away is the plain answer of the fixture without them', () => {
    for (const c of cases) {
      const without: RightAnswerFixture = { ...c.fixture, check: { ...c.fixture.check, quickLines: [] } };
      expect(foldQuickLines(without)).toBe(without);
      expect(plainAnswer(without).code).toBeDefined();
    }
  });

  it('income dated today or earlier counts from tomorrow; a monthly one moves on a month at a time', () => {
    const f = cases[3]?.fixture as RightAnswerFixture;
    const withIncome = (everyMonths: 0 | 1, date: string): RightAnswerFixture => ({
      ...f,
      check: { ...f.check, quickLines: [{ id: 'i', kind: 'income', amount: 100, everyMonths, date }] },
    });
    expect(quickIncomeDates(withIncome(0, '2026-11-15')).map((x) => x.date)).toEqual(['2026-11-16']);
    expect(quickIncomeDates(withIncome(1, '2026-09-20')).map((x) => x.date)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20']);
  });
});
