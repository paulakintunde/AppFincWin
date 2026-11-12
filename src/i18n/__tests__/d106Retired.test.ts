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
});
