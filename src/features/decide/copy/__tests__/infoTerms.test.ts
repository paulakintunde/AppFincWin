import en from '@/i18n/locales/en';
import { INFO_KEYS, infoCopy } from '../infoTerms';
import { ref } from '../types';

const node = (path: string): unknown => path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
const str = (path: string): string | undefined => (typeof node(path) === 'string' ? (node(path) as string) : undefined);
const sentences = (s: string): number => (s.match(/[.!?](?=\s|$)/g) ?? []).length;

describe('infoTerms', () => {
  it('D-70 INFO_TERMS has the 31 R3 keys', () => {
    expect(INFO_KEYS).toHaveLength(31);
    expect(new Set(INFO_KEYS).size).toBe(31);
    expect(INFO_KEYS[0]).toBe('replaces');
    expect(INFO_KEYS[30]).toBe('whatGetsWritten');
  });

  it('D-70 every info entry has a term, a body of at most 3 sentences and what this changes', () => {
    for (const key of INFO_KEYS) {
      const c = infoCopy(key, key === 'cushionMonths' ? { cushionMonths: { months: 3, reason: ref('x') } } : undefined);
      expect(str(c.term.key)).toBeTruthy();
      expect(str(c.changes.key)).toBeTruthy();
      const bodies = c.body.map((b) => str(b.key) ?? str(`${b.key}_other`));
      for (const b of bodies) expect(b).toBeTruthy();
      expect(sentences(bodies.join(' '))).toBeLessThanOrEqual(3);
      expect(c.term.key).toBe(`decide.info.${key}.term`);
    }
  });

  it('D-70 the cushion line carries the user figures and falls back to the static body', () => {
    const reason = ref('decide.depth.cushion.reason', { months: '3' });
    const withLine = infoCopy('cushionMonths', { cushionMonths: { months: 4, reason } });
    expect(withLine.body).toEqual([ref('decide.info.cushionMonths.body'), ref('decide.info.cushionMonths.line', { count: 4 })]);
    expect(withLine.reason).toEqual(reason);
    expect(str('decide.info.cushionMonths.line_one')).toBe('Your line is 1\u00A0month, {{reason}}.');
    const without = infoCopy('cushionMonths');
    expect(without.body).toEqual([ref('decide.info.cushionMonths.body')]);
    expect(without.reason).toBeUndefined();
  });

  it('D-70 the provisional rate body falls back without a date', () => {
    expect(infoCopy('provisionalRate', { provisionalRate: { date: '1 Oct' } }).body).toEqual([ref('decide.info.provisionalRate.body', { date: '1 Oct' })]);
    expect(infoCopy('provisionalRate').body).toEqual([ref('decide.info.provisionalRate.bodyNoDate')]);
    expect(str('decide.info.provisionalRate.bodyNoDate')).not.toContain('{{');
  });

  const NB = '\u00A0';
  const REFRESH_KEYS = [
    'decide.fold.title.whatBreaks', 'decide.fold.title.assumptions', 'decide.fold.preview.whatBreaks', 'decide.fold.preview.edgeSuffix',
    'decide.fold.preview.nothingBreaks', 'decide.fold.preview.nothingBreaksEdge', 'decide.fold.preview.landsBetter', 'decide.fold.preview.landsWorse',
    'decide.fold.preview.landsSame', 'decide.fold.preview.noMoves', 'decide.fold.preview.investIdle', 'decide.fold.preview.investWithRate',
    'decide.fold.preview.income', 'decide.fold.preview.month', 'decide.fold.preview.setbacks', 'decide.fold.preview.setbacksNone',
    'decide.fold.preview.options', 'decide.fold.preview.who', 'decide.fold.preview.assumptions', 'decide.fold.cashPath.preview',
    'decide.fold.cashPath.unavailablePreview', 'decide.fold.cashPath.unavailableBody', 'decide.fold.cashPath.recurringLink', 'decide.fold.everyLine',
    'decide.fold.a11y.label', 'decide.fold.a11y.showHint', 'decide.fold.a11y.hideHint', 'decide.fold.a11y.expanded', 'decide.fold.a11y.collapsed',
    'decide.fold.a11y.expandedCollapsed', 'decide.verdict.key.leftCaption', 'decide.verdict.key.cushionCaption', 'decide.verdict.key.monthlyCaption',
    'decide.verdict.key.putInCaption', 'decide.verdict.key.months', 'decide.verdict.key.underOne', 'decide.verdict.key.notLimited',
    'decide.verdict.key.none', 'decide.verdict.key.a11y', 'decide.details.show', 'decide.details.hide', 'decide.details.showA11y',
    'decide.details.hideA11y', 'decide.hint.foldTap', 'decide.infoButton.a11y', 'decide.infoButton.hint', 'decide.infoButton.sheetChanges',
    'decide.infoButton.close', 'decide.slider.above', 'decide.slider.below', 'decide.custom.chip', 'decide.custom.chipA11y', 'decide.custom.months',
    'decide.custom.ratePercent', 'decide.custom.unit.months', 'decide.custom.unit.apr', 'decide.custom.unit.percent', 'decide.custom.range.months',
    'decide.custom.range.count', 'decide.custom.range.horizon', 'decide.custom.range.apr', 'decide.custom.range.aprUpTo', 'decide.custom.range.percent',
    'decide.custom.range.upToPrice', 'decide.custom.range.from', 'decide.custom.fieldA11y', 'decide.home.addChange', 'decide.home.checkInvestment',
    'decide.home.linesFold.title', 'decide.home.linesFold.preview', 'decide.home.linesFold.allDefault', 'decide.quick.clearText', 'decide.quick.clearA11y',
    'decide.quick.placeholderShort', 'decide.clear.button', 'decide.clear.a11y', 'decide.clear.hint', 'decide.clear.toast', 'decide.delete.word',
    'decide.delete.menuOpen', 'decide.delete.menuReopen', 'decide.delete.menuEdit', 'decide.delete.moreA11y', 'decide.delete.keep', 'decide.delete.confirm',
    'decide.delete.checkTitle', 'decide.delete.checkBody', 'decide.delete.decisionTitle', 'decide.delete.boughtBody', 'decide.delete.waitingBody',
    'decide.delete.passedBody', 'decide.delete.changeTitle', 'decide.delete.changeBody', 'decide.delete.toastCheck', 'decide.delete.toastDecision',
    'decide.delete.toastChange', 'decide.save.saved', 'decide.save.saving', 'decide.save.offline', 'decide.save.failed', 'decide.save.offlineA11y',
    'decide.save.failedA11y', 'undo.label.checkCleared', 'undo.label.checkDeleted', 'undo.label.decisionDeleted', 'undo.label.changeDeleted',
    'undo.labelUnnamed.checkCleared', 'undo.labelUnnamed.checkDeleted', 'undo.labelUnnamed.decisionDeleted',
    'decide.quick.overMonths', 'decide.quick.monthlyCaption', 'decide.quick.monthlyCaptionZero', 'decide.quick.monthlyCaptionPaidOff',
    'decide.pay.loanTermNote', 'decide.pay.cardMonthsValue',
  ];

  it('D-70..D-78 refresh keys resolve', () => {
    for (const k of REFRESH_KEYS) {
      const v = str(k) ?? str(`${k}_other`);
      expect({ k, ok: typeof v === 'string' && v.length > 0 }).toEqual({ k, ok: true });
    }
  });

  it('R3 F6 plural keys exist as _one and _other with a no-break space before the unit', () => {
    for (const k of ['decide.quick.overMonths', 'decide.quick.monthlyCaption', 'decide.quick.monthlyCaptionZero', 'decide.quick.monthlyCaptionPaidOff', 'decide.pay.loanTermNote', 'decide.pay.cardMonthsValue']) {
      expect(str(`${k}_one`)).toContain(`1${NB}mo`);
      expect(str(`${k}_other`)).toContain(`{{count}}${NB}mo`);
    }
    expect(str('decide.quick.overMonths_other')).toBe(`Over {{count}}${NB}months`);
    expect(str('decide.pay.loanTermNote_other')).toMatch(new RegExp(`^At \\{\\{count\\}\\}${NB}months the payment is`));
  });
});
