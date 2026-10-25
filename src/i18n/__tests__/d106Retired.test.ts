// D-106 (05-141): the keys the free / overspent wording replaced are gone, and the This-month strings exist.
import en from '../locales/en';

const node = (path: string): unknown => path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);

describe('D-106 retired keys', () => {
  it('D-106 retired keys are gone', () => {
    const gone = [
      'decide.verdict.key.leftCaption', 'decide.decision.leftAfter', 'decide.depth.income.rows.left', 'decide.section.lineMonthDesc',
      'decide.home.card.a11yNfcfLeft', 'decide.home.card.a11yNfcfShort', 'decide.home.hero.left', 'decide.home.hero.short',
      'decide.home.hero.leftWord', 'decide.home.hero.shortWord', 'decide.home.hero.summaryShort', 'decide.home.monthDetails.resultShort',
    ];
    for (const k of gone) expect({ k, v: node(k) }).toEqual({ k, v: undefined });
  });

  it('D-106 the replacements exist', () => {
    const here = [
      'decide.home.card.a11yNfcfFree', 'decide.home.card.a11yNfcfOverspent', 'decide.home.hero.freeWord', 'decide.home.hero.overspentWord',
      'decide.home.hero.summary', 'decide.home.hero.summaryOverspent', 'decide.home.monthDetails.resultOverspent',
    ];
    for (const k of here) expect({ k, ok: typeof node(k) === 'string' }).toEqual({ k, ok: true });
  });

  it('D-106 the This-month strings exist', () => {
    const keys = [
      'decide.home.hero.subMonth', 'decide.home.hero.monthWaitingRate', 'decide.home.monthDetails.basisMonth', 'decide.month.thisMonthChip',
      'decide.home.card.judge.month', 'decide.home.card.judge.worst', 'decide.home.card.judge.average', 'decide.home.card.judge.a11y',
      'decide.home.card.judge.sheetTitle', 'decide.home.card.judge.sheetBody', 'decide.home.card.judge.sheetWaiting',
      'decide.verdict.compare.title', 'decide.verdict.compare.month', 'decide.verdict.compare.worst', 'decide.verdict.compare.average',
      'decide.verdict.compare.chosen', 'decide.verdict.compare.rowA11y', 'decide.verdict.compare.rowA11yChosen', 'decide.verdict.compare.waiting',
      'decide.fig.free', 'decide.fig.overspent',
    ];
    for (const k of keys) expect({ k, ok: typeof node(k) === 'string' }).toEqual({ k, ok: true });
    expect(node('decide.home.hero.monthWaitingRate')).toBe('This month is waiting for a {{currency}} rate');
  });
});
