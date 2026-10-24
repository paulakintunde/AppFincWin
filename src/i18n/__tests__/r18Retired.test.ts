// R18.1 "Retired keys" (05-130): the copy R18 replaced is gone from the catalogue and cannot come back unnoticed.
import en from '../locales/en';

const node = (path: string): unknown => path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);

function leaves(n: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof n === 'string') return [{ path: prefix, value: n }];
  if (n && typeof n === 'object') return Object.entries(n as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

describe('R18 retired copy', () => {
  it('D-100 the retired card labels and month strip keys no longer exist', () => {
    const gone = [
      'decide.home.card.labelWorst', 'decide.home.card.labelAverage', 'decide.home.card.labelTightest', 'decide.home.card.labelFigures',
      'decide.home.card.labelSwitched', 'decide.home.hero.sub', 'decide.home.card.a11yLeft', 'decide.home.card.a11yShort',
      'decide.month.in', 'decide.month.out', 'decide.month.left',
    ];
    for (const k of gone) expect({ k, v: node(k) }).toEqual({ k, v: undefined });
    // the twins that serve now
    for (const k of ['decide.home.card.eyebrow', 'decide.home.card.a11yNfcfFree', 'decide.home.card.a11yNfcfOverspent', 'decide.home.hero.subWorst']) {
      expect({ k, ok: typeof node(k) === 'string' }).toEqual({ k, ok: true });
    }
  });

  it('D-101 the unused pots caption and progress keys are gone (GoalProgress and decide.depth.goal.* serve the rows)', () => {
    for (const k of ['decide.pots.caption', 'decide.pots.progressA11y']) expect({ k, v: node(k) }).toEqual({ k, v: undefined });
  });

  it('D-103 no of-5 line text remains', () => {
    const gone = [
      'decide.home.rows.linesSet_one', 'decide.home.rows.linesSet_other', 'decide.home.linesFold.preview_one', 'decide.home.linesFold.preview_other',
    ];
    for (const k of gone) expect({ k, v: node(k) }).toEqual({ k, v: undefined });
    const stale = leaves(en.decide).filter(({ value }) => /\bof 5 set by you\b/.test(value)).map(({ path }) => path);
    expect(stale).toEqual([]);
  });

  it('D-101 the undo refusal names a savings_goals record as a pot', () => {
    expect(node('undo.refusal.record.savings_goals')).toBe('this pot');
  });
});
