import en from '@/i18n/locales/en';
import { INFO_KEYS, infoCopy, type InfoDynamic } from '../infoTerms';
import { ref } from '../types';

const node = (path: string): unknown => path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
const str = (path: string): string | undefined => (typeof node(path) === 'string' ? (node(path) as string) : undefined);
const sentences = (s: string): number => (s.match(/[.!?](?=\s|$)/g) ?? []).length;

describe('infoTerms', () => {
  it('D-100 INFO_KEYS holds 65 terms and the five R18 terms resolve', () => {
    expect(INFO_KEYS).toHaveLength(65);
    expect(new Set(INFO_KEYS).size).toBe(65);
    expect(INFO_KEYS.slice(60)).toEqual(['netFreeCashFlow', 'pots', 'totalCost', 'housingLine', 'investedInstead']);
    for (const key of INFO_KEYS.slice(60)) {
      const c = infoCopy(key);
      expect(str(c.term.key)).toBeTruthy();
      expect(str(c.changes.key)).toBeTruthy();
      const body = c.body.map((b) => str(b.key)).join(' ');
      expect(sentences(body)).toBeLessThanOrEqual(3);
      expect(body).not.toMatch(/lender/i);
    }
    expect(str('decide.info.netFreeCashFlow.term')).toBe('Net free cash flow');
    expect(str('decide.info.pots.changes')).toContain('Marking it done releases both.');
    expect(str('decide.info.housingLine.body')).toContain('Left blank, it is 28%.');
    expect(str('decide.info.investedInstead.body')).toContain('not a forecast');
  });

  it('D-100 the R18 catalogue keys resolve and the sub-lines end as the user worded them', () => {
    const NBSP = ' ';
    const keys = [
      'home.card.eyebrow', 'home.card.a11yNfcfLeft', 'home.card.a11yNfcfShort',
      'home.hero.subWorst', 'home.hero.subAverage', 'home.hero.subTightest', 'home.hero.subFigures', 'home.hero.subSwitched',
      'home.monthDetails.title', 'home.monthDetails.basisWorst', 'home.monthDetails.basisAverage', 'home.monthDetails.basisTightest',
      'home.monthDetails.basisFigures', 'home.monthDetails.basisSwitched', 'home.monthDetails.in', 'home.monthDetails.spending',
      'home.monthDetails.debts', 'home.monthDetails.saving', 'home.monthDetails.pots', 'home.monthDetails.result',
      'home.monthDetails.resultShort', 'home.monthDetails.potsLink', 'home.monthDetails.rowA11y',
      'home.rows.linesSetSix', 'home.linesFold.previewSix', 'home.problems.potPastDue', 'home.problems.affectsPots',
      'home.problems.potPastDueAffects', 'home.problems.potPastDueAction',
      'pots.summary', 'pots.doneFold', 'pots.sheet.previewActive', 'verdict.tco.year', 'verdict.tco.month', 'verdict.tco.a11y_year',
      'verdict.tco.a11y_month', 'verdict.invested.year', 'verdict.invested.month', 'verdict.invested.feeYear', 'verdict.invested.feeMonth',
    ];
    for (const k of keys) {
      const hasPlural = !!str(`decide.${k}_one`) && !!str(`decide.${k}_other`);
      expect({ k, ok: hasPlural || !!str(`decide.${k}`) }).toEqual({ k, ok: true });
    }
    const single = [
      'pots.title', 'pots.sub', 'pots.add', 'pots.addA11y', 'pots.limit', 'pots.loading', 'pots.loadError', 'pots.empty', 'pots.emptyAction', 'pots.doneLine',
      'pots.stateActive', 'pots.stateReached', 'pots.statePastDue', 'pots.stateWait', 'pots.stateNoRate', 'pots.rowA11y', 'pots.menu.markDone',
      'pots.menu.reopen', 'pots.menu.delete', 'pots.menu.moreFor', 'pots.sheet.titleNew', 'pots.sheet.titleEdit', 'pots.sheet.cancel', 'pots.sheet.name',
      'pots.sheet.namePlaceholder', 'pots.sheet.target', 'pots.sheet.by', 'pots.sheet.byRange', 'pots.sheet.alreadySaved', 'pots.sheet.previewReached',
      'pots.sheet.previewPast', 'pots.sheet.savedNote', 'pots.sheet.tagTransfer', 'pots.sheet.save', 'pots.toast.saved', 'pots.toast.deleted',
      'pots.toast.done', 'pots.toast.reopened', 'verdict.invested.tooLarge', 'verdict.invested.a11y', 'verdict.titleHousing', 'verdict.titleHousingNoIncome',
      'section.monthPots', 'section.lineHousing', 'section.lineHousingDesc', 'section.lineHousingDescNoIncome', 'assumptions.housingToday',
      'warn.housingTitle', 'warn.housingValue', 'warn.housingBody', 'warn.housingValueNoIncome', 'warn.housingBodyNoIncome',
      'lines.housing.name', 'lines.housing.desc', 'lines.housing.value', 'lines.housing.info',
      'housing.heading', 'housing.helper', 'housing.switchLabel', 'housing.switchA11y', 'housing.switchHint', 'housing.empty', 'housing.payment',
    ];
    for (const k of single) expect({ k, ok: !!str(`decide.${k}`) }).toEqual({ k, ok: true });
    expect(str('you.record.pots')).toBe('Pots');
    for (const k of ['subWorst', 'subAverage', 'subTightest', 'subFigures', 'subSwitched']) {
      expect(str(`decide.home.hero.${k}`)).toMatch(/, after spending, debts and everything set aside$/);
    }
    expect(str('decide.home.monthDetails.basisTightest')).toBe('Worked out on your tightest figures.');
    expect(str('decide.pots.sheet.previewActive_other')).toBe(`About {{amount}} a month for {{count}}${NBSP}months.`);
    expect(str('decide.verdict.tco.year_other')).toBe(`Over {{count}}${NBSP}years: {{total}} in all`);
    expect(str('decide.verdict.invested.feeYear_other')).toBe(`Invested instead: {{fv}} after {{count}}${NBSP}years at {{rate}}%, less {{fee}}% fees`);
    expect(str('decide.home.rows.linesSetSix_other')).toBe(`{{count}}${NBSP}of 6 set by you`);
    expect(str('decide.warn.housingTitle')).toBe('Housing costs go over your line');
    expect(str('decide.verdict.titleHousingNoIncome')!.length).toBeLessThanOrEqual(64);
    // the retired five-line and old-label strings are gone (05-130, r18Retired.test.ts)
    expect(str('decide.home.rows.linesSet_other')).toBeUndefined();
    expect(str('decide.home.hero.sub')).toBeUndefined();
  });

  it('D-95 INFO_TERMS keeps tightestFigures at index 59', () => {
    expect(INFO_KEYS[59]).toBe('tightestFigures');
    expect(INFO_KEYS[0]).toBe('replaces');
    expect(INFO_KEYS[30]).toBe('whatGetsWritten');
    expect(INFO_KEYS[31]).toBe('price');
    expect(INFO_KEYS[54]).toBe('cardClearing');
    expect(INFO_KEYS.slice(55, 60)).toEqual(['interestSaved', 'instalmentFrequency', 'impliedApr', 'cardCheckLimit', 'tightestFigures']);
    expect(str('decide.info.tightestFigures.term')).toBe('Your tightest figures');
    expect(str('decide.info.tightestFigures.body')).toBe(
      'Fewer than 3 full months are logged, so money in uses your lowest month and spending uses your highest. The figure combines the two, which can be tighter than any single month.'
    );
    expect(str('decide.info.tightestFigures.changes')).toBe('Once 3 full months exist, the label follows your worst or average month.');
  });

  it('D-95 R17 strings resolve', () => {
    const NB = ' ';
    const keys = [
      'header', 'card.eyebrow', 'card.details', 'card.detailsA11y', 'card.detailsHint',
      'card.a11yNfcfLeft', 'card.a11yNfcfShort', 'card.loading', 'hero.left', 'hero.short', 'hero.leftWord', 'hero.shortWord', 'hero.subWorst', 'hero.inOut', 'hero.summary', 'hero.summaryShort',
      'unavailable.title', 'unavailable.noFigures', 'unavailable.rate', 'unavailable.addRough', 'unavailable.seeLines',
      'field.placeholder', 'field.placeholderShort', 'field.a11y', 'field.check', 'field.full', 'field.fullA11y',
      'rows.open', 'rows.openChanged', 'rows.changes', 'rows.changesAdd', 'rows.past', 'rows.lines', 'rows.linesSetSix_one', 'rows.linesSetSix_other', 'rows.linesDefault', 'rows.a11y',
      'notice.items_one', 'notice.items_other', 'notice.offline', 'notice.offlineWaiting_one', 'notice.offlineWaiting_other', 'notice.saving', 'notice.hint',
      'problems.title', 'problems.affects', 'problems.entryA11y', 'problems.close',
      'problems.noMonth.title', 'problems.noMonth.affects', 'problems.noMonth.action',
      'problems.rate.title', 'problems.rate.action', 'problems.rate.affectsLines_one', 'problems.rate.affectsLines_other', 'problems.rate.affectsCardLimit',
      'problems.rate.affectsChecks_one', 'problems.rate.affectsChecks_other',
      'problems.failed_one', 'problems.failed_other', 'problems.failedAction', 'problems.conflict_one', 'problems.conflict_other', 'problems.conflictAction', 'problems.recordsOnDevice',
      'problems.cardMin.title', 'problems.cardMin.affects', 'problems.cardMin.action', 'problems.stale.title', 'problems.stale.affects', 'problems.stale.action',
      'problems.offline.offlineWaiting_one', 'problems.offline.offlineWaiting_other', 'problems.offline.saving', 'problems.offline.affects', 'problems.offline.note',
      'monthDetails.close',
    ];
    for (const k of keys) expect({ k, v: str(`decide.home.${k}`) }).toEqual({ k, v: expect.any(String) });
    const h = (k: string) => str(`decide.home.${k}`);
    expect(h('hero.left')).toBe('{{amount}} left');
    expect(h('hero.short')).toBe('{{amount}} short');
    expect(h('hero.subWorst')).toBe('in your worst month, after spending, debts and everything set aside');
    expect(h('card.a11yNfcfLeft')).toBe('Net free cash flow: {{amount}} left {{basis}}. In {{in}}, out {{out}}.');
    expect(h('field.check')).toBe('Check it');
    expect(h('field.full')).toBe('Full check');
    expect(h('problems.failedAction')).toBe('Review changes');
    expect(h('problems.conflictAction')).toBe('Review edits');
    expect(h('problems.rate.action')).toBe('Exchange rates');
    expect(h('problems.cardMin.action')).toBe('Card minimum payment');
    expect(h('notice.items_one')).toBe(`{{count}}${NB}item needs a look`);
    expect(h('notice.items_other')).toBe(`{{count}}${NB}items need a look`);
    expect(h('notice.offlineWaiting_other')).toBe(`Offline · {{count}}${NB}changes waiting`);
    expect(h('rows.openChanged')).toBe(`{{count}}${NB}changed since you looked`);
    // every count is followed by a no-break space, never a plain one
    const counted = keys.map((k) => ({ k, v: h(k) ?? '' })).filter(({ v }) => v.includes('{{count}}'));
    expect(counted.length).toBeGreaterThan(10);
    for (const { k, v } of counted.filter(({ k: kk }) => kk !== 'rows.linesSetSix_one' && kk !== 'rows.linesSetSix_other')) {
      expect({ k, ok: !/\{\{count\}\} /.test(v) }).toEqual({ k, ok: true });
    }
  });

  it('R16 the card limit explanation has a USD-home variant', () => {
    const conv = infoCopy('cardCheckLimit', { cardCheckLimit: { cap: '£78,000', usdLimit: '$100,000' } });
    expect(conv.body).toEqual([ref('decide.info.cardCheckLimit.body', { cap: '£78,000', usdLimit: '$100,000' })]);
    const usd = infoCopy('cardCheckLimit', { cardCheckLimit: { usdLimit: '$100,000', usdHome: true } });
    expect(usd.body).toEqual([ref('decide.info.cardCheckLimit.bodyUsdHome', { usdLimit: '$100,000' })]);
    expect(str('decide.info.cardCheckLimit.bodyUsdHome')).not.toContain('{{cap}}');
    expect(str('decide.info.cardCheckLimit.body')).toContain('{{cap}}');
    expect(str('decide.info.cardCheckLimit.body')).toContain('{{usdLimit}}');
  });

  it('R16 the On a card explanation falls back without a cap', () => {
    expect(infoCopy('onCard', { onCard: { cap: '$100,000' } }).body).toEqual([ref('decide.info.onCard.body', { cap: '$100,000' })]);
    expect(str('decide.info.onCard.body')).toContain('At most {{cap}} goes on a card in checks.');
    expect(infoCopy('onCard').body).toEqual([ref('decide.info.onCard.bodyNoCap')]);
    expect(str('decide.info.onCard.bodyNoCap')).not.toContain('{{');
    expect(infoCopy('cardCheckLimit').body).toEqual([ref('decide.info.cardCheckLimit.bodyNoLimit')]);
  });

  it('R16 no rendered explanation contains a raw placeholder', () => {
    const dyn: InfoDynamic[] = [
      {},
      { cushionMonths: { months: 3, reason: ref('x') }, provisionalRate: { date: '1 Oct' }, onCard: { cap: '$1' }, cardCheckLimit: { cap: '£1', usdLimit: '$1' } },
      { cardCheckLimit: { usdLimit: '$1', usdHome: true } },
    ];
    for (const key of INFO_KEYS) {
      for (const d of dyn) {
        const c = infoCopy(key, d);
        for (const r of [c.term, c.changes, ...c.body]) {
          const raw = str(r.key) ?? str(`${r.key}_other`) ?? '';
          // a ref with params supplies them; strip the names it carries, then nothing may remain
          const left = raw.replace(/\{\{(\w+)\}\}/g, (m, n: string) => (r.params && n in r.params ? '' : n === 'reason' && c.reason ? '' : m));
          expect({ key: r.key, left: left.includes('{{') }).toEqual({ key: r.key, left: false });
        }
      }
    }
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
    'decide.custom.range.upToPrice', 'decide.custom.range.from', 'decide.custom.fieldA11y', 'decide.custom.outOfRange',
    'decide.home.linesFold.title', 'decide.home.linesFold.previewSix', 'decide.home.linesFold.allDefault', 'decide.quick.clearText', 'decide.quick.clearA11y',
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
    'decide.pay.summaryDay', 'decide.pay.summaryLoan',
    'decide.pay.summaryCardFull', 'decide.pay.summaryCardMinimum', 'decide.pay.summaryCardMonths', 'decide.pay.summaryLump', 'decide.pay.summaryLumpRate',
    'decide.pay.summaryContribution',
    'decide.pay.instalmentHasRate', 'decide.pay.instalmentNo', 'decide.pay.instalmentYes', 'decide.pay.instalmentQuoted',
    'decide.pay.instalmentCalcNote', 'decide.pay.instalmentFirst', 'decide.pay.instalmentToday',
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
  });

  it('R3 F6 plural keys exist as _one and _other with a no-break space before the unit', () => {
    for (const k of ['decide.quick.overMonths', 'decide.quick.monthlyCaption', 'decide.quick.monthlyCaptionZero', 'decide.quick.monthlyCaptionPaidOff', 'decide.pay.loanTermNote', 'decide.pay.cardMonthsValue']) {
      expect(str(`${k}_one`)).toContain(`1${NB}mo`);
      expect(str(`${k}_other`)).toContain(`{{count}}${NB}mo`);
    }
    expect(str('decide.quick.overMonths_other')).toBe(`Over {{count}}${NB}months`);
    expect(str('decide.pay.loanTermNote_other')).toMatch(new RegExp(`^At \\{\\{count\\}\\}${NB}months the payment is`));
  });

  const R16_KEYS = [
    'you.add.section', 'you.add.expense', 'you.add.income', 'you.add.transfer', 'you.add.importStatement', 'you.add.newCheck',
    'you.add.expenseHint', 'you.add.incomeHint', 'you.add.transferHint', 'you.add.importStatementHint', 'you.add.newCheckHint',
    'sync.saving', 'sync.waiting', 'sync.offlineWaiting',
    'decide.fold.updating', 'decide.verdict.key.over50Years', 'decide.verdict.key.over50YearsA11y', 'decide.fold.preview.setbacksOver50',
    'decide.section.setbacksSummaryOver50', 'decide.verdict.missing.card_limit_rate_missing', 'decide.pay.card.field.usdRate',
    'decide.item.itemType.property', 'decide.item.itemType.cash_equivalent', 'decide.item.itemType.tuition',
    'decide.pay.loanInterestSavedByDeposit', 'decide.pay.loanInterestPaid', 'decide.pay.loanSavedLine',
    'decide.pay.freq.label', 'decide.pay.freq.weekly', 'decide.pay.freq.fortnightly', 'decide.pay.freq.monthly', 'decide.pay.freq.quarterly',
    'decide.pay.firstPayment.today', 'decide.pay.firstPayment.weekly', 'decide.pay.firstPayment.fortnightly', 'decide.pay.firstPayment.monthly',
    'decide.pay.firstPayment.quarterly', 'decide.pay.when.today', 'decide.pay.when.weekly', 'decide.pay.when.fortnightly', 'decide.pay.when.monthly',
    'decide.pay.when.quarterly', 'decide.pay.instalmentCountRange', 'decide.pay.instRateAbout', 'decide.pay.instRateAbove', 'decide.pay.instRateZero',
    'decide.pay.instSummaryNoRate', 'decide.pay.instSummaryRate', 'decide.pay.instSummaryFirst',
    'decide.pay.cardLimitBody', 'decide.pay.cardLimitNote', 'decide.pay.cardLimitBasis', 'decide.pay.cardNote.property', 'decide.pay.cardNote.cash_equivalent',
    'decide.pay.cardNote.tuition_fee', 'decide.pay.cardNote.tax_processing_fee', 'decide.pay.cardNote.tax_gb',
    'decide.depth.running.amountPlaceholder', 'decide.depth.running.amountFieldA11y', 'decide.depth.running.rowA11yEmpty', 'decide.depth.running.rowA11yCounted',
    'decide.depth.running.notCounted', 'decide.depth.running.propertyTax', 'decide.depth.running.homeInsurance', 'decide.depth.running.utilities',
    'decide.depth.running.serviceCharge', 'decide.depth.running.booksMaterials', 'decide.depth.running.travel', 'decide.depth.running.accommodation',
  ];
  const FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly'] as const;

  it('D-85..D-93 R16 strings resolve', () => {
    for (const k of R16_KEYS) {
      const v = str(k) ?? str(`${k}_other`);
      expect({ k, ok: typeof v === 'string' && v.length > 0 }).toEqual({ k, ok: true });
    }
    for (const f of FREQS) {
      for (const g of ['instNoRate', 'instRate', 'instSummary']) {
        expect({ k: `${g}.${f}_one`, ok: !!str(`decide.pay.${g}.${f}_one`) }).toEqual({ k: `${g}.${f}_one`, ok: true });
        expect({ k: `${g}.${f}_other`, ok: !!str(`decide.pay.${g}.${f}_other`) }).toEqual({ k: `${g}.${f}_other`, ok: true });
      }
    }
    expect(str('decide.pay.cardLimitBody')).toBe('Only {{cap}} of this goes on a card in checks. The other {{rest}} is counted as cash on the day.');
  });

  it('R16 plural keys carry U+00A0 after the count', () => {
    for (const f of FREQS) {
      expect(str(`decide.pay.instNoRate.${f}_one`)).toMatch(new RegExp(`^1${NB}`));
      expect(str(`decide.pay.instNoRate.${f}_other`)).toMatch(new RegExp(`^\{\{count\}\}${NB}`));
      expect(str(`decide.pay.instRate.${f}_one`)).toMatch(new RegExp(`^1${NB}`));
      expect(str(`decide.pay.instRate.${f}_other`)).toMatch(new RegExp(`^\{\{count\}\}${NB}`));
    }
    expect(str('decide.pay.loanSavedLine_one')).toContain(`same 1${NB}month at`);
    expect(str('decide.pay.loanSavedLine_other')).toContain(`same {{count}}${NB}months at`);
    expect(str('sync.waiting_one')).toBe(`{{count}}${NB}change waiting`);
    expect(str('sync.waiting_other')).toBe(`{{count}}${NB}changes waiting`);
    expect(str('sync.offlineWaiting_one')).toBe(`offline · {{count}}${NB}change waiting`);
    expect(str('sync.offlineWaiting_other')).toBe(`offline · {{count}}${NB}changes waiting`);
  });

  it('R16.16 M6 the no-rate note reads as the spec table (lead plus clause)', () => {
    const about = str('decide.pay.instRateAbout');
    expect(`${str('decide.pay.instNoRate.weekly_other')} ${about}`).toBe(
      `{{count}}${NB}weekly payments of {{payment}}, about {{monthly}} a month. No rate was quoted: about {{apr}}% a year, worked out from the figures you typed.`
    );
    expect(`${str('decide.pay.instNoRate.monthly_other')} ${about}`).toBe(
      `{{count}}${NB}monthly payments of {{payment}}. No rate was quoted: about {{apr}}% a year, worked out from the figures you typed.`
    );
    expect(str('decide.pay.instRateAbove')).toContain('above 999.99% a year');
    expect(str('decide.pay.instRateZero')).toContain('0% a year');
    expect(str('decide.pay.instRate.fortnightly_other')).toBe(
      `{{count}}${NB}payments of {{payment}} every 2 weeks at {{apr}}%, the first {{when}}; about {{monthly}} a month. Interest over the plan is {{interest}}.`
    );
    expect(str('decide.pay.instRate.monthly_other')).not.toContain('{{monthly}}');
  });

  it('R16 the old queued strings are gone and the new ones do not say queued', () => {
    expect(str('sync.queued_other')).toBeUndefined();
    expect(str('sync.offlineQueued_other')).toBeUndefined();
    for (const k of ['sync.saving', 'sync.waiting_one', 'sync.waiting_other', 'sync.offlineWaiting_one', 'sync.offlineWaiting_other']) expect(str(k)).not.toMatch(/queued/);
  });
});
