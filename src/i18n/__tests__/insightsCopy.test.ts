// 07-04 (D-04, T-07-11): Insights copy stays declarative, never advice or a grade. Curly apostrophes only.
import { checkString } from '../copyGuard/guard.cjs';
import en from '../locales/en';
import { insights } from '../locales/insights';

function collect(node: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collect(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

const strings = collect(insights, 'insights');

describe('insights copy', () => {
  it('is wired into en.ts', () => {
    expect(en.insights).toBe(insights);
  });

  it('uses typographic apostrophes only', () => {
    expect(strings.filter((s) => s.value.includes("'"))).toEqual([]);
  });

  it('uses no advice or grade words', () => {
    const re = /\b(advice|advise|recommend\w*|should|best|better|optimal|healthy|unhealthy|poor|good|bad|strong|steady|tight|great|excellent)\b/i;
    expect(strings.filter((s) => re.test(s.value))).toEqual([]);
  });

  it('keeps the score sentence, part name and footer fixed', () => {
    expect(insights.score.fixed).toBe('Score {{score}} out of 100, from these figures');
    expect(insights.score.parts.billsToPay.name).toBe('Bills still to pay this month');
    expect(insights.footer.endsWith('FincWin holds no money and moves none.')).toBe(true);
  });

  it('carries the D-27 note under Where it went', () => {
    expect(insights.categories.debtSavingNote).toBe('Debt payments and saving are not counted here.');
  });

  it('reads months of cover singular and plural', () => {
    expect(insights.score.parts.cover.figure_one).toBe('{{months}} month');
    expect(insights.score.parts.cover.figure_other).toBe('{{months}} months');
  });

  it('describes ranges as full months plus this month so far (D-26a)', () => {
    expect(insights.range.sixMonthsA11y).toContain('this month so far');
    expect(insights.range.oneYearA11y).toContain('this month so far');
  });

  it('the guard insights set flags a grade word under insights.*', () => {
    const v = checkString('insights.x', 'A healthy month');
    expect(v.some((x) => x.set === 'insights')).toBe(true);
  });

  it('the guard passes every insights string', () => {
    expect(strings.flatMap((s) => checkString(s.path, s.value))).toEqual([]);
  });
});
