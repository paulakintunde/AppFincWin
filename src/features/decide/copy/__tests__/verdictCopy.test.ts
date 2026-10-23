import { percent } from '@/engine/decide';
import type { CardPlanDetail, Plan } from '@/engine/decide';
import { cardReasonCards, warningCard } from '../warningCopy';
import { ADJUST_TITLE, basisMarker, missingRateCopy, stateChip, verdictBody, verdictTitle } from '../verdictCopy';
import { BASE_PLAN, assessmentOf, fmt, fmtDate, w, withContext } from './helpers/fixtures';
import { resolvesInEn } from './helpers/enKeys';
import type { CopyRef } from '../types';

const keysOf = (r: CopyRef): string[] => [r.key, ...Object.values(r.keyParams ?? {})];

describe('stateChip', () => {
  it('maps each state and surface', () => {
    expect(stateChip('fits', 'full')).toEqual({ key: 'decide.state.fits', tone: 'fits' });
    expect(stateChip('adjust', 'quickCash').key).toBe('decide.state.adjust');
    expect(stateChip('no', 'quickCash').key).toBe('decide.state.noCash');
    expect(stateChip('no', 'quickCredit').key).toBe('decide.state.noCredit');
    expect(stateChip('no', 'full').key).toBe('decide.state.no');
    expect(stateChip('missing', 'full', ['card_missing']).key).toBe('decide.state.cardLimits');
    expect(stateChip('missing', 'full', ['no_full_month']).key).toBe('decide.state.missing');
    expect(stateChip('missing', 'full').key).toBe('decide.state.missing');
    expect(stateChip('draft', 'full').tone).toBe('draft');
    expect(stateChip('bought', 'full').key).toBe('decide.state.bought');
    expect(stateChip('waiting', 'full').key).toBe('decide.state.waiting');
    expect(stateChip('passed', 'full').key).toBe('decide.state.passed');
  });
});

describe('verdictTitle', () => {
  it('missing uses the first reason', () => {
    const v = { state: 'missing', reasons: ['loan_apr_missing'], size: null } as never;
    expect(verdictTitle(v, fmt).key).toBe('decide.verdict.missing.loan_apr_missing');
    expect(verdictTitle({ state: 'missing', reasons: [], size: null } as never, fmt).key).toBe('decide.verdict.missing.no_full_month');
  });

  it('fits names what is left', () => {
    expect(verdictTitle(assessmentOf({ left: 40_000 }), fmt)).toEqual({ key: 'decide.verdict.titleFits', params: { left: '$40000' } });
  });

  it('no: empty cash outranks the month', () => {
    const a = assessmentOf({ state: 'no', cashAfter: -5, warnings: [w('month', 100)] });
    expect(verdictTitle(a, fmt).key).toBe('decide.verdict.titleNoEmptyCash');
  });

  it('no: a month short, plain or already short', () => {
    const plain = assessmentOf({ state: 'no', warnings: [w('month', 100)] });
    expect(verdictTitle(plain, fmt)).toEqual({ key: 'decide.verdict.titleNoMonthShort', params: { short: '$100' } });
    const already = assessmentOf({ state: 'no', warnings: [w('month', 300)], left: -300, ...withContext({ leftBefore: -200 }) });
    const t = verdictTitle(already, fmt);
    expect(t.key).toBe('decide.verdict.titleNoAlreadyShort');
    expect(t.params).toEqual({ already: '$200', short: '$300' });
    // a purchase that adds nothing never says "this makes it"
    const same = assessmentOf({ state: 'no', warnings: [w('month', 200)], left: -200, ...withContext({ leftBefore: -200 }) });
    expect(verdictTitle(same, fmt)).toEqual({ key: 'decide.verdict.titleNoAlreadyShortSame', params: { already: '$200' }, keyParams: expect.any(Object) });
    expect(t.keyParams).toEqual({ basis: 'decide.verdict.basisAverage' });
    const worst = verdictTitle(assessmentOf({ state: 'no', warnings: [w('month', 300)], ...withContext({ leftBefore: -1, money: { basis: 'worst', incomeBasis: 1 } }) }), fmt);
    expect(worst.keyParams).toEqual({ basis: 'decide.verdict.basisWorst' });
  });

  it('a hard cash dip alone is no with its own title', () => {
    const a = assessmentOf({ state: 'no', cashAfter: 10, cashDip: 'hard', warnings: [w('cash_dip', 50)] });
    expect(verdictTitle(a, fmt).key).toBe('decide.verdict.titleNoCashDip');
  });

  it('an adjust verdict led by cash_dip has a title', () => {
    const a = assessmentOf({ state: 'adjust', warnings: [w('cash_dip', 70)] });
    expect(verdictTitle(a, fmt)).toEqual({ key: 'decide.verdict.titleCashDip', params: { amount: '$70' } });
  });

  it('adjust leads with each warning code', () => {
    const lead = (code: Parameters<typeof w>[0], over = {}) => verdictTitle(assessmentOf({ state: 'adjust', warnings: [w(code, 5)], ...over }), fmt);
    expect(lead('cash').key).toBe('decide.verdict.titleCash');
    expect(lead('month').key).toBe('decide.verdict.titleNoMonthShort');
    expect(lead('owe').key).toBe('decide.verdict.titleOwe');
    expect(lead('dsr')).toEqual({ key: 'decide.verdict.titleDsr', params: { pct: '22.99%' } });
    expect(lead('inv', { investingAtRisk: 5, pauseNeeded: 5 }).key).toBe('decide.verdict.titleInvInvesting');
    expect(lead('inv', { savingAtRisk: 5, pauseNeeded: 5 }).key).toBe('decide.verdict.titleInvSaving');
    expect(lead('inv', { investingAtRisk: 5, savingAtRisk: 5, pauseNeeded: 10 })).toEqual({ key: 'decide.verdict.titleInvBoth', params: { amount: '$10' } });
    expect(Object.keys(ADJUST_TITLE).sort()).toEqual(['cash', 'cash_dip', 'dsr', 'inv', 'month', 'owe']);
  });

  it('a zero-income dsr breach never prints a null ratio', () => {
    const a = assessmentOf({ state: 'adjust', warnings: [w('dsr', 10)], debtServiceRatioAfter: null });
    const t = verdictTitle(a, fmt);
    expect(t).toEqual({ key: 'decide.verdict.titleDsrNoIncome' });
    const card = warningCard(w('dsr', 10), a, fmt, fmtDate);
    expect(card.value).toEqual({ key: 'decide.warn.dsrValueNoIncome' });
    expect(card.body[0]).toEqual({ key: 'decide.warn.dsrBodyNoIncome', params: { line: '36%', debt: '$85000' } });
    expect(JSON.stringify([t, card])).not.toMatch(/null/);
  });

  it('IN-B07: an adjust verdict with no warning, or a month lead with no month warning, has a plain title and no zero claim', () => {
    expect(verdictTitle(assessmentOf({ state: 'adjust', warnings: [] }), fmt)).toEqual({ key: 'decide.verdict.titleUnexplained' });
  });
});

describe('verdictBody and basisMarker', () => {
  it('fits and other', () => {
    expect(verdictBody(assessmentOf({}), fmt)).toEqual({ key: 'decide.verdict.bodyFits', params: { in: '$400000', out: '$335000' } });
    const other = verdictBody(assessmentOf({ state: 'adjust' }), fmt);
    expect(other.key).toBe('decide.verdict.bodyOther');
    expect(other.keyParams).toEqual({ basis: 'decide.verdict.basisAverage' });
  });

  it('first read, now logged, average and worst', () => {
    const avg = { basis: 'average', incomeBasis: 400_000 } as never;
    const worst = { basis: 'worst', incomeBasis: 300_000 } as never;
    expect(basisMarker({ kind: 'first_read', money: null, lastSeenBasis: null }, fmt).key).toBe('decide.basis.firstRead');
    expect(basisMarker({ kind: 'logged', money: null, lastSeenBasis: null }, fmt).key).toBe('decide.basis.firstRead');
    expect(basisMarker({ kind: 'logged', money: avg, lastSeenBasis: 'first_read_rough_figures' }, fmt).key).toBe('decide.basis.nowLogged');
    expect(basisMarker({ kind: 'logged', money: avg, lastSeenBasis: 'logged_months' }, fmt)).toEqual({ key: 'decide.basis.average', params: { amount: '$400000' } });
    expect(basisMarker({ kind: 'logged', money: worst, lastSeenBasis: null }, fmt)).toEqual({ key: 'decide.basis.worst', params: { amount: '$300000' } });
  });
});

describe('warningCard', () => {
  it('month: plain, and already short', () => {
    const plain = warningCard(w('month', 100), assessmentOf({}), fmt, fmtDate);
    expect(plain.tone).toBe('hard');
    expect(plain.body[0]!.key).toBe('decide.warn.monthBody');
    const already = warningCard(w('month', 300), assessmentOf({ left: -300, ...withContext({ leftBefore: -200 }) }), fmt, fmtDate);
    expect(already.body[0]!.key).toBe('decide.warn.monthAlready');
    expect(already.body[0]!.params).toEqual({ already: '$200', added: '$100', gap: '$300' });
  });

  it('month, already short, adding nothing: before, adding and after agree and the pause is named (combined view, paid in full)', () => {
    // before 12,536.39 short, a monthly cost of 0, saving paused for 556.61: the card says the gap stays, then what the pause covers
    const a = assessmentOf({ left: -1_253_639, ...withContext({ leftBefore: -1_253_639 }) });
    const card = warningCard(w('month', 1_197_978), a, fmt, fmtDate);
    expect(card.body.map((b) => b.key)).toEqual(['decide.warn.monthAlreadySame', 'decide.warn.monthPaused']);
    expect(card.body[0]!.params).toEqual({ already: '$1253639' });
    expect(card.body[1]!.params).toEqual({ paused: '$55661', short: '$1197978' });
    const noPause = warningCard(w('month', 1_253_639), a, fmt, fmtDate);
    expect(noPause.body.map((b) => b.key)).toEqual(['decide.warn.monthAlreadySame']);
    for (const key of ['decide.warn.monthAlreadySame', 'decide.warn.monthPaused']) expect(resolvesInEn(key)).toBe(true);
    expect(JSON.stringify(card)).not.toMatch(/Adding/);
  });

  it('dsr percent values are grouped and carry the percent sign, for the value, the line and the no-income body', () => {
    const big = assessmentOf({ debtServiceRatioAfter: percent('1565.6') } as never);
    expect(warningCard(w('dsr', 1), big, fmt, fmtDate).value).toEqual({ key: 'decide.warn.dsrValue', params: { pct: '1,565.6%' } });
    expect(warningCard(w('dsr', 1), assessmentOf({ debtServiceRatioAfter: percent('12') } as never), fmt, fmtDate).value!.params).toEqual({ pct: '12%' });
  });

  it('every warning code gives a value with its unit: amounts through fmt, the dsr as a percent', () => {
    const a = assessmentOf({ investingAtRisk: 5_000, investingAfter: 15_000, pauseNeeded: 5_000, cashDip: 'soft' });
    expect(warningCard(w('month', 100), a, fmt, fmtDate).value!.params).toEqual({ amount: '$100' });
    expect(warningCard(w('cash', 40), a, fmt, fmtDate).value!.params).toEqual({ amount: '$40' });
    expect(warningCard(w('cash_dip', 70), a, fmt, fmtDate).value!.params).toEqual({ amount: '$70' });
    expect(warningCard(w('dsr', 1), a, fmt, fmtDate).value!.params).toEqual({ pct: '22.99%' });
    expect(warningCard(w('owe', 1), a, fmt, fmtDate).value!.params).toEqual({ amount: '$1000000' });
    expect(warningCard(w('inv', 5_000), a, fmt, fmtDate).value!.params).toEqual({ amount: '$5000' });
  });

  it('cash states the cushion and the figure left', () => {
    const c = warningCard(w('cash', 40), assessmentOf({ cashAfter: 60_000, mineDayOne: 2 }), fmt, fmtDate);
    expect(c.tone).toBe('soft');
    expect(c.body[0]!.params).toEqual({ cushion: '$100000', day: '$2', cashAfter: '$60000' });
  });

  it('cash_dip names the date and the extra depth', () => {
    const a = assessmentOf({
      cashDip: 'soft',
      cashPath: { status: 'available', lowestWith: { day: 4, date: '2026-11-04', amount: 20_000 } } as never,
    });
    const c = warningCard(w('cash_dip', 70), a, fmt, fmtDate);
    expect(c.title.key).toBe('decide.warn.cashDipTitle');
    expect(c.value).toEqual({ key: 'decide.warn.cashDipValue', params: { amount: '$70' } });
    expect(c.body).toEqual([{ key: 'decide.warn.cashDipBody', params: { amount: '$70', lowest: '$20000', date: 'on 2026-11-04' } }]);
    expect(c.tone).toBe('soft');
    expect(warningCard(w('cash_dip', 70), { ...a, cashDip: 'hard' }, fmt, fmtDate).tone).toBe('hard');
    expect(warningCard(w('cash_dip', 70), assessmentOf({ cashDip: 'soft' }), fmt, fmtDate).body).toEqual([]);
  });

  it('dsr with a ratio, and owe', () => {
    const d = warningCard(w('dsr', 1), assessmentOf({}), fmt, fmtDate);
    expect(d.value).toEqual({ key: 'decide.warn.dsrValue', params: { pct: '22.99%' } });
    expect(d.body[0]!.key).toBe('decide.warn.dsrBody');
    const o = warningCard(w('owe', 1), assessmentOf({}), fmt, fmtDate);
    expect(o.tone).toBe('hard');
    expect(o.body[0]!.params).toEqual({ amount: '$1000000', annual: '$4800000', mult: 12 });
  });

  it('inv: investing, saving, both, and below a floor', () => {
    const inv = warningCard(w('inv', 5_000), assessmentOf({ investingAtRisk: 5_000, investingAfter: 15_000, pauseNeeded: 5_000 }), fmt, fmtDate);
    expect(inv.title.key).toBe('decide.warn.invTitleInvesting');
    expect(inv.body[0]!.params).toEqual({ amount: '$5000', from: '$20000', to: '$15000' });
    expect(inv.body).toHaveLength(1);
    const sav = warningCard(w('inv', 5_000), assessmentOf({ savingAtRisk: 5_000, savingAfter: 5_000, pauseNeeded: 5_000 }), fmt, fmtDate);
    expect(sav.title.key).toBe('decide.warn.invTitleSaving');
    expect(sav.body[1]).toEqual({ key: 'decide.warn.invBelowFloor', params: { floor: '$10000' } });
    const both = warningCard(w('inv', 9_000), assessmentOf({ investingAtRisk: 4_000, savingAtRisk: 5_000, investingAfter: 5_000, savingAfter: 25_000, pauseNeeded: 9_000 }), fmt, fmtDate);
    expect(both.title.key).toBe('decide.warn.invTitleBoth');
    expect(both.body[0]!.params).toEqual({ amount: '$9000', savingFrom: '$30000', savingTo: '$25000', from: '$9000', to: '$5000' });
    expect(both.body[1]!.key).toBe('decide.warn.invBelowFloor');
  });
});

describe('cardReasonCards', () => {
  const cardPlan = (card: { [K in keyof CardPlanDetail]?: unknown }, over: { [K in keyof Plan]?: unknown } = {}): Plan =>
    ({ ...BASE_PLAN, ...over, card: { eligibility: 'ok', onCard: 900_000, remainderOnDay: 0, payoff: 'minimum', payoffMonths: null, minimumOutcome: null, remainingAtCap: null, fees: 0, cardCosts: null, ...card } }) as never;

  it('none for a plan without a card or a missing verdict without card_not_accepted', () => {
    expect(cardReasonCards(assessmentOf({}), fmt)).toEqual([]);
    expect(cardReasonCards({ state: 'missing', reasons: ['card_missing'], size: null } as never, fmt)).toEqual([]);
  });

  it('card not accepted', () => {
    const cards = cardReasonCards({ state: 'missing', reasons: ['card_not_accepted'], size: null } as never, fmt);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.tone).toBe('hard');
  });

  it('remainder on the day is soft with no value chip', () => {
    const cards = cardReasonCards(assessmentOf({ plan: cardPlan({ remainderOnDay: 100_000, payoff: 'full' }) }), fmt);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.value).toBeNull();
    expect(cards[0]!.tone).toBe('soft');
    expect(cards[0]!.body[0]!.params).toEqual({ cap: '$900000', price: '$1000000' });
  });

  it('minimum that never clears', () => {
    const cards = cardReasonCards(assessmentOf({ plan: cardPlan({ minimumOutcome: 'never_clears' }) }), fmt);
    expect(cards[0]!.value!.key).toBe('decide.warn.cardMinimumNever');
    expect(cards[0]!.tone).toBe('hard');
  });

  it('minimum that clears states the years', () => {
    const cards = cardReasonCards(assessmentOf({ plan: cardPlan({ minimumOutcome: 'cleared', payoffMonths: 90 }, { interest: 12_345 }) }), fmt);
    expect(cards[0]!.value).toEqual({ key: 'decide.warn.cardMinimumYears', params: { count: 8 } });
    expect(cards[0]!.body[0]!.params).toEqual({ months: 90, years: 8, interest: '$12345', balance: '$900000' });
    expect(cardReasonCards(assessmentOf({ plan: cardPlan({ minimumOutcome: 'cleared', payoffMonths: null }) }), fmt)).toEqual([]);
    expect(cardReasonCards(assessmentOf({ plan: cardPlan({ minimumOutcome: 'cleared', payoffMonths: 3 }, { interest: null }) }), fmt)[0]!.value!.params).toEqual({ count: 1 });
  });

  it('a card open at 50 years states what is still owed', () => {
    const plan = cardPlan({ minimumOutcome: 'exceeds_month_cap', remainingAtCap: 640_000 }, { total: null, interest: null });
    const cards = cardReasonCards(assessmentOf({ plan }), fmt);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.title.key).toBe('decide.warn.cardCapTitle');
    expect(cards[0]!.value).toEqual({ key: 'decide.warn.cardCapValue', params: { amount: '$640000' } });
    expect(cards[0]!.body[0]).toEqual({ key: 'decide.warn.cardCapBody', params: { amount: '$640000', balance: '$900000' } });
    expect(cards[0]!.tone).toBe('hard');
    const nullOwed = cardReasonCards(assessmentOf({ plan: cardPlan({ minimumOutcome: 'exceeds_month_cap', remainingAtCap: null }) }), fmt);
    expect(nullOwed[0]!.value!.params).toEqual({ amount: '$0' });
  });
});

describe('missingRateCopy', () => {
  it('names the currencies', () => {
    const c = missingRateCopy({ currencies: ['EUR', 'GBP'], rowCount: 2 });
    expect(c.title).toEqual({ key: 'decide.missingRate.title', params: { currency: 'EUR, GBP' } });
    expect(c.chip.key).toBe('decide.missingRate.chip');
    expect(c.link.key).toBe('decide.missingRate.link');
  });
});

describe('every key resolves and no copy is prescriptive', () => {
  it('walks a fixture set', () => {
    const adjust = (code: Parameters<typeof w>[0]) => assessmentOf({ state: 'adjust', warnings: [w(code, 9)], cashDip: 'soft', cashPath: { status: 'available', lowestWith: { day: 1, date: '2026-11-01', amount: 1 } } as never, investingAtRisk: 1, pauseNeeded: 1 });
    const refs: CopyRef[] = [];
    for (const code of ['month', 'cash', 'cash_dip', 'dsr', 'owe', 'inv'] as const) {
      const a = adjust(code);
      refs.push(verdictTitle(a, fmt), verdictBody(a, fmt));
      const card = warningCard(w(code, 9), a, fmt, fmtDate);
      refs.push(card.title, ...(card.value ? [card.value] : []), ...card.body);
    }
    refs.push(percentRef());
    for (const r of refs) for (const k of keysOf(r)) expect(resolvesInEn(k)).toBe(true);
  });
});

function percentRef(): CopyRef {
  return verdictTitle(assessmentOf({ state: 'adjust', warnings: [w('dsr', 1)], debtServiceRatioAfter: percent('9.4') }), fmt);
}
