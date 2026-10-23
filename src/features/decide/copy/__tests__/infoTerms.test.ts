import en from '@/i18n/locales/en';
import { INFO_KEYS, infoCopy } from '../infoTerms';
import { ref } from '../types';

const node = (path: string): unknown => path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
const str = (path: string): string | undefined => (typeof node(path) === 'string' ? (node(path) as string) : undefined);
const sentences = (s: string): number => (s.match(/[.!?](?=\s|$)/g) ?? []).length;

describe('infoTerms', () => {
  it('D-70 / D-84 INFO_TERMS has the 31 R3 keys and the 24 R15.8 keys', () => {
    expect(INFO_KEYS).toHaveLength(55);
    expect(new Set(INFO_KEYS).size).toBe(55);
    expect(INFO_KEYS[0]).toBe('replaces');
    expect(INFO_KEYS[30]).toBe('whatGetsWritten');
    expect(INFO_KEYS[31]).toBe('price');
    expect(INFO_KEYS[54]).toBe('cardClearing');
  });

  it('D-84 every R15.8 entry has a term, a body of at most 3 sentences and what this changes', () => {
    for (const key of INFO_KEYS.slice(31)) {
      const c = infoCopy(key);
      expect(str(c.term.key)).toBeTruthy();
      expect(str(c.changes.key)).toBeTruthy();
      const body = c.body.map((b) => str(b.key)).join(' ');
      expect(body).toBeTruthy();
      expect(sentences(body)).toBeLessThanOrEqual(3);
    }
    expect(str('decide.info.apr.body')).toContain('Before any interest');
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

  const R15_KEYS = [
    'decide.pay.price.head', 'decide.pay.price.amount', 'decide.pay.price.taxFees', 'decide.pay.price.tradeInTag', 'decide.pay.price.final', 'decide.pay.price.edit',
    'decide.pay.howYouPay.head', 'decide.pay.howYouPay.headInvest', 'decide.pay.howYouPay.sub', 'decide.pay.howYouPay.subInvest',
    'decide.pay.card.needs', 'decide.pay.card.field.price', 'decide.pay.card.field.rate', 'decide.pay.card.field.months', 'decide.pay.card.field.payment',
    'decide.pay.card.field.howMany', 'decide.pay.card.field.cardRate', 'decide.pay.card.field.minimumTerms', 'decide.pay.card.field.dealerCap',
    'decide.pay.card.field.amount', 'decide.pay.card.comesTo', 'decide.pay.card.selected', 'decide.pay.card.notSelected', 'decide.pay.card.hint',
    'decide.pay.card.hintReadOnly', 'decide.pay.card.announce',
    'decide.pay.summaryDay', 'decide.pay.summaryLoan', 'decide.pay.summaryInstalmentNoRate', 'decide.pay.summaryInstalmentRate', 'decide.pay.summaryFirstInMonth',
    'decide.pay.summaryCardFull', 'decide.pay.summaryCardMinimum', 'decide.pay.summaryCardMonths', 'decide.pay.summaryLump', 'decide.pay.summaryLumpRate',
    'decide.pay.summaryContribution',
    'decide.pay.instalmentHasRate', 'decide.pay.instalmentNo', 'decide.pay.instalmentYes', 'decide.pay.instalmentQuoted', 'decide.pay.instalmentRateNote',
    'decide.pay.instalmentRateNoteMonth', 'decide.pay.instalmentCalcNote', 'decide.pay.instalmentFirst', 'decide.pay.instalmentToday', 'decide.pay.instalmentInMonth',
    'decide.customType.chip', 'decide.customType.placeholder', 'decide.customType.range', 'decide.customType.a11y', 'decide.customType.treatLike',
    'decide.customType.general', 'decide.customType.treatedLike',
    'decide.fold.title.grow', 'decide.fold.investPreview', 'decide.fold.noReturn.preview', 'decide.fold.noReturn.body', 'decide.fold.noReturn.link',
    'decide.pay.horizonOver', 'decide.pay.horizonCustom', 'decide.pay.horizonYears',
    'decide.pay.expectedReturn', 'decide.pay.projection', 'decide.verdict.projection', 'decide.pay.assumptionReturn', 'decide.pay.assumptionReturnValue',
    'decide.verdict.missing.instalment_rate_missing',
  ];

  it('D-79..D-84 R15 strings resolve', () => {
    for (const k of R15_KEYS) {
      const v = str(k) ?? str(`${k}_other`);
      expect({ k, ok: typeof v === 'string' && v.length > 0 }).toEqual({ k, ok: true });
    }
  });

  it('R15 plural keys exist as _one and _other with a no-break space between count and unit', () => {
    const PLURALS = [
      'decide.pay.summaryLoan', 'decide.pay.summaryCardMonths', 'decide.pay.summaryContribution', 'decide.pay.projection',
      'decide.verdict.projection', 'decide.fold.investPreview', 'decide.pay.horizonYears',
    ];
    for (const k of PLURALS) {
      expect(str(`${k}_one`)).toContain(`1${NB}`);
      expect(str(`${k}_other`)).toMatch(new RegExp(`\\{\\{count\\}\\}${NB}(months|years)`));
    }
    expect(str('decide.pay.instalmentRateNote_one')).toMatch(/^1 payment of/);
    expect(str('decide.pay.instalmentRateNote_other')).toMatch(/^\{\{count\}\} payments of/);
    expect(str('decide.pay.instalmentRateNoteMonth_other')).toContain('the first in a month');
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
