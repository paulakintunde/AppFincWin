import en from '@/i18n/locales/en';
import { percent } from '@/engine/decide';
import type { Basis, DecideOption } from '@/engine/decide';
import { basisKeyParams, basisMarkerKey, basisVariantKey, basisWordKey, monthClosesKey } from '../basisKey';
import { optionCopy } from '../optionCopy';
import type { CopyRef } from '../types';
import { warningCard } from '../warningCopy';
import { basisMarker, verdictBody, verdictTitle } from '../verdictCopy';
import { assessmentOf, fmt, fmtCents, fmtDate, w, withContext } from './helpers/fixtures';

const BASES: readonly Basis[] = ['average', 'worst', 'month'];

function leaf(key: string): string {
  let node: unknown = en;
  for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
  if (typeof node !== 'string') throw new Error(`no string at ${key}`);
  return node;
}

/** A ref resolved the way the screen does: params, and keyParams translated then interpolated. */
function say(r: CopyRef): string {
  const params: Record<string, string | number> = { ...r.params };
  for (const [name, key] of Object.entries(r.keyParams ?? {})) params[name] = leaf(key);
  return leaf(r.key).replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(params[n] ?? `{{${n}}}`));
}

const inBasis = (basis: Basis, over: Record<string, unknown> = {}) =>
  withContext({ money: { basis, incomeBasis: 400_000 }, ...over });

describe('D-107 basisKey', () => {
  it('D-107 each basis maps to its own key', () => {
    expect(basisWordKey('average')).toBe('decide.verdict.basisAverage');
    expect(basisWordKey('worst')).toBe('decide.verdict.basisWorst');
    expect(BASES.map(basisMarkerKey)).toEqual(['decide.basis.average', 'decide.basis.worst', 'decide.basis.month']);
    expect(BASES.map(monthClosesKey)).toEqual([
      'decide.section.monthClosesAverage',
      'decide.section.monthClosesWorst',
      'decide.section.monthClosesMonth',
    ]);
    expect(BASES.map((b) => basisVariantKey('decide.warn.monthAlready', b))).toEqual([
      'decide.warn.monthAlready',
      'decide.warn.monthAlready',
      'decide.warn.monthAlreadyMonth',
    ]);
    expect(basisKeyParams('average')).toEqual({ basis: 'decide.verdict.basisAverage' });
    expect(basisKeyParams('worst')).toEqual({ basis: 'decide.verdict.basisWorst' });
    expect(basisKeyParams('month')).toBeUndefined();
  });

  it('D-107 every mapped key resolves to a string in en', () => {
    for (const b of BASES) {
      for (const k of [basisMarkerKey(b), monthClosesKey(b)]) expect(typeof leaf(k)).toBe('string');
      for (const k of [
        'decide.verdict.titleNoAlreadyShort',
        'decide.verdict.titleNoAlreadyShortSame',
        'decide.verdict.bodyOther',
        'decide.warn.monthAlready',
        'decide.warn.monthAlreadySame',
        'decide.section.monthNote',
        'decide.section.optEarnDesc',
        'decide.section.asIncomeValue',
      ]) expect(typeof leaf(basisVariantKey(k, b))).toBe('string');
    }
  });

  it('D-107 no month-basis string contains the phrase "this month month" or a leftover {{basis}}', () => {
    const keys = [
      'decide.verdict.titleNoAlreadyShortMonth',
      'decide.verdict.titleNoAlreadyShortSameMonth',
      'decide.verdict.bodyOtherMonth',
      'decide.warn.monthAlreadyMonth',
      'decide.warn.monthAlreadySameMonth',
      'decide.section.monthNoteMonth',
      'decide.section.monthClosesMonth',
      'decide.section.optEarnDescMonth',
      'decide.section.asIncomeValueMonth',
      'decide.basis.month',
    ];
    for (const k of keys) {
      const text = leaf(k);
      expect(text).not.toMatch(/\{\{basis\}\}/);
      expect(text.toLowerCase()).not.toContain('this month month');
      expect(text.toLowerCase()).not.toContain('your this month');
    }
  });

  it('D-107 the verdict title reads This month is {already} overspent on the month basis', () => {
    const already = assessmentOf({ state: 'no', warnings: [w('month', 300)], left: -300, ...inBasis('month', { leftBefore: -200 }) });
    const same = assessmentOf({ state: 'no', warnings: [w('month', 200)], left: -200, ...inBasis('month', { leftBefore: -200 }) });
    expect(say(verdictTitle(already, fmt))).toBe('This month is $200 overspent. This makes it $300.');
    expect(say(verdictTitle(same, fmt))).toBe('This month is already $200 overspent either way.');
    const avg = assessmentOf({ state: 'no', warnings: [w('month', 300)], left: -300, ...inBasis('average', { leftBefore: -200 }) });
    expect(say(verdictTitle(avg, fmt))).toBe('Your average month is $200 overspent. This makes it $300.');
  });

  it('D-107 the verdict body names this month on the month basis', () => {
    const a = assessmentOf({ state: 'no', warnings: [w('month', 300)], left: -300, monthTable: { after: { outgoings: 450_000 } }, ...inBasis('month', { leftBefore: -200 }) });
    expect(say(verdictBody(a, fmt))).toBe('$400000 in this month; $450000 out once this is running.');
  });

  it('D-107 the month warning reads This month is {already} overspent before this purchase', () => {
    const a = assessmentOf({ state: 'no', warnings: [w('month', 300)], left: -300, ...inBasis('month', { leftBefore: -200, pausable: 0 }) });
    const card = warningCard(w('month', 300), a, fmt, fmtDate);
    expect(say(card.body[0]!)).toMatch(/^This month is \$200 overspent before this purchase\. Adding \$100 takes the gap to \$300\./);
    const same = assessmentOf({ state: 'no', warnings: [w('month', 200)], left: -200, ...inBasis('month', { leftBefore: -200, pausable: 0 }) });
    expect(say(warningCard(w('month', 200), same, fmt, fmtDate).body[0]!)).toMatch(/^This month is \$200 overspent before this purchase, and this purchase adds nothing/);
  });

  it('D-107 the basis marker reads This month · {amount} in', () => {
    const money = { basis: 'month', incomeBasis: 400_000 } as never;
    expect(say(basisMarker({ kind: 'logged', money, lastSeenBasis: null }, fmt))).toBe('This month · $400000 in');
  });

  it("D-107 the options' earn line says this month is expected to bring in", () => {
    const earn = (basis: Basis) =>
      ({ code: 'earn_more', gap: 800, incomeBasis: 4_000, basis, percentOfIncome: percent('20') }) as unknown as DecideOption;
    const ctx = { fmt, fmtCents, lineName: (id: string) => id };
    expect(say(optionCopy(earn('month'), ctx).desc!)).toBe('That is 20% more than this month is expected to bring in.');
    expect(say(optionCopy(earn('worst'), ctx).desc!)).toBe('That is 20% more than your worst month brings in.');
  });
});
