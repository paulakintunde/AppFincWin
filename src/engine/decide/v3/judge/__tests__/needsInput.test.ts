import { minorUnits, type MinorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import type { Funds, IncomeMonth, IncomePicture, MonthModel, Purchase, UnspentState, V3Inputs } from '../../types';
import { ASOF, inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { needsInput } from '../needsInput';

const mu = (n: number): MinorUnits => minorUnits(n);

function month(over: Partial<MonthModel> = {}): MonthModel {
  return {
    month: '2026-10', day: 20, daysInMonth: 31, moneyIn: mu(0), moneyOut: mu(0), billsPaid: mu(0), billsDue: mu(0),
    everydayLogged: mu(100_000), erest: mu(0), setAside: mu(0), monthLeft: mu(50_000), e: mu(100_000),
    typicalIncome: mu(500_000), recurringBills: mu(0), typicalLeft: null, low: null, monthsUsed: [], categoryMonthly: [],
    housingMonthly: mu(0), largestLine: null, confidence: { level: 'fair', reasons: [] }, notices: [], reasons: [], ...over,
  };
}

const anchor = { amount: mu(10_000), at: '2026-10-01' };
const unspent = (drifted = false): UnspentState => ({
  value: mu(10_000), anchor, rolled: false, stale: false, drifted,
  breakdown: { in: mu(0), everyday: mu(0), bills: mu(0), loans: mu(0), investedSaved: mu(0), other: mu(0) },
});

function funds(u: UnspentState | null = unspent()): Funds {
  return { balance: mu(0), suggested: mu(0), unspent: u, emergency: null, envelopesSaved: mu(0), envelopesMonthly: mu(0), ownEnvelope: mu(0), spending: mu(0) };
}

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    whole: mu(10_000), dayOne: mu(10_000), monthly: mu(0), runningMonthly: mu(0), schedule: null, share: SOLE_SHARE,
    itemType: 'electronics', purpose: null, emergency: false, canUseEmergency: false, band: 3, layers: ['L0'],
    financed: false, secured: false, categoryId: null, envelopeId: null, ...over,
  };
}

const pay = v3Series({ id: 'p', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-09-25', amount: 400_000 });
const rough = { income: mu(1), expenses: mu(1), saving: mu(0), debt: mu(0), invest: mu(0), asOf: ASOF };
const run = (inputs: V3Inputs, over: Partial<{ month: MonthModel; funds: Funds; purchase: Purchase | null; miss: never[] }> = {}) =>
  needsInput({
    inputs,
    month: over.month ?? month(),
    funds: over.funds ?? funds(),
    purchase: over.purchase === undefined ? purchase() : over.purchase,
    purchaseMissing: over.miss ?? [],
  });

describe('needsInput', () => {
  it('5.4.1 no income figures', () => {
    expect(run(inputsOf())).toContain('no_income_figures');
    expect(run(inputsOf({ series: [pay] }))).not.toContain('no_income_figures');
    expect(run(inputsOf({ rough }))).not.toContain('no_income_figures');
    expect(run(inputsOf({ profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null } }))).not.toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, confirmed: false }] }))).toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, status: 'dismissed' }] }))).toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, status: 'ended', endDate: '2026-09-01' }] }))).toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, status: 'ended', endDate: '2026-12-01' }] }))).not.toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, status: 'ended', endDate: null }] }))).toContain('no_income_figures');
    expect(run(inputsOf({ series: [{ ...pay, endDate: '2026-09-01' }] }))).toContain('no_income_figures');
  });

  it('L-09 a bill payment is not the newest spending entry; an everyday line is', () => {
    const bill = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-09-05', amount: 100_000 });
    const behindMonth = month({ everydayLogged: mu(10_000) });
    const billOnly = inputsOf({
      series: [pay, bill],
      months: [monthOf('2026-10', [v3Line({ id: 'b', date: ASOF, amount: 100_000, seriesId: 'rent' })])],
    });
    expect(run(billOnly, { month: behindMonth, purchase: purchase({ band: 5 }) })).toEqual(['records_look_behind']);
    const everyday = inputsOf({
      series: [pay, bill],
      months: [monthOf('2026-10', [v3Line({ id: 'e', date: ASOF, amount: 100 })])],
    });
    expect(run(everyday, { month: behindMonth, purchase: purchase({ band: 5 }) })).toEqual([]);
  });

  it('L-09 / T-05.1-75 the own envelope covers day one with the room: no unspent question', () => {
    const i = inputsOf({ series: [pay] });
    const withEnv = { ...funds(null), ownEnvelope: mu(10_000) };
    expect(run(i, { funds: withEnv, purchase: purchase({ dayOne: mu(60_000) }) })).toEqual([]);
    expect(run(i, { funds: withEnv, purchase: purchase({ dayOne: mu(60_001) }) })).toEqual(['unspent_not_confirmed']);
    const neg = { ...funds(null), ownEnvelope: mu(-5) };
    expect(run(i, { funds: neg, purchase: purchase({ dayOne: mu(50_001) }) })).toEqual(['unspent_not_confirmed']);
  });

  it('5.4.2 unspent not confirmed', () => {
    const i = inputsOf({ series: [pay] });
    expect(run(i, { funds: funds(null), purchase: purchase({ dayOne: mu(50_001) }) })).toEqual(['unspent_not_confirmed']);
    expect(run(i, { funds: funds(null), purchase: purchase({ dayOne: mu(50_000) }) })).toEqual([]);
    expect(run(i, { funds: funds(null), month: month({ monthLeft: mu(-5) }), purchase: purchase({ dayOne: mu(1) }) })).toEqual(['unspent_not_confirmed']);
    expect(run(i, { funds: funds(null), purchase: null })).toEqual([]);
  });

  it('5.4.3 records look behind', () => {
    const stale = inputsOf({ series: [pay], months: [monthOf('2026-10', [v3Line({ id: 'a', date: '2026-09-20', amount: 100 })])] });
    const behindMonth = month({ everydayLogged: mu(10_000) });
    expect(run(stale, { month: behindMonth, purchase: purchase({ band: 5 }) })).toEqual(['records_look_behind']);
    expect(run(stale, { month: behindMonth, purchase: purchase({ band: 4 }) })).toEqual([]);
    expect(run(stale, { purchase: purchase({ band: 5 }) })).toEqual([]);
    const fresh = inputsOf({ series: [pay], months: [monthOf('2026-10', [v3Line({ id: 'a', date: ASOF, amount: 100 })])] });
    expect(run(fresh, { month: behindMonth, purchase: purchase({ band: 5 }) })).toEqual([]);
    const none = inputsOf({ series: [pay] });
    expect(run(none, { month: behindMonth, purchase: purchase({ band: 5 }) })).toEqual(['records_look_behind']);
  });

  it('everyday unknown', () => {
    expect(run(inputsOf({ series: [pay] }), { month: month({ e: null }) })).toEqual(['everyday_unknown']);
  });

  it('D-32 rough only answers', () => {
    const r = run(inputsOf({ rough }), { month: month({ e: null }) });
    expect(r).not.toContain('no_income_figures');
    expect(r).not.toContain('everyday_unknown');
  });

  it('D-30 drift is not needs input', () => {
    expect(run(inputsOf({ series: [pay] }), { funds: funds(unspent(true)) })).toEqual([]);
  });

  it('purchase-missing passes through, result unique and in D-59 priority order', () => {
    const r = needsInput({
      inputs: inputsOf({ series: [pay] }), month: month(), funds: funds(), purchase: purchase(),
      purchaseMissing: ['plan_rate_missing', 'no_price', 'no_price'],
    });
    expect(r).toEqual(['no_price', 'plan_rate_missing']); // D-59: owner priority order
  });

  it('v3 §12 #13 Jordan', () => {
    expect(run(inputsOf(), { month: month({ e: null }), purchase: null })).toContain('no_income_figures');
  });

  // --- gap closure (05.1-44) ---
  const winMonth = (m: string, income: number): IncomeMonth => ({ month: m, income: mu(income), everyday: mu(0), left: mu(0), lean: false });
  const twelve = (): IncomeMonth[] =>
    ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => winMonth(m, 300_000));
  function pic(over: Partial<IncomePicture> = {}): IncomePicture {
    return {
      stated: 'seasonal', treated: 'seasonal', swings: true, volatile: false, confirmNeeded: false, windowMonths: 12, fullMonths: 12,
      months: twelve(), leanLeft: null, expectedThisMonth: null, ...over,
    };
  }
  const withPic = (p: IncomePicture) => month({ incomePicture: p });
  const base = inputsOf({ series: [pay] });
  const exp = (m: string, amount = 250_000) => ({ month: m, amount: mu(amount), at: ASOF });

  it('D-34 swings with an unconfirmed pattern ask to confirm it, with or without a purchase', () => {
    const p = pic({ stated: null, treated: 'variable', confirmNeeded: true });
    expect(run(base, { month: withPic(p) })).toContain('income_pattern_unconfirmed');
    expect(run(base, { month: withPic(p), purchase: null })).toContain('income_pattern_unconfirmed');
    expect(run(base, { month: withPic(pic()) })).not.toContain('income_pattern_unconfirmed');
    expect(run(base)).not.toContain('income_pattern_unconfirmed');
  });

  it('D-35 seasonal with 12 months of records and a same-month figure is not asked', () => {
    expect(run(base, { month: withPic(pic()) })).not.toContain('expected_income_needed');
  });

  it('D-35 fewer than 12 full months asks, unless every depended-on month is confirmed', () => {
    const short = pic({ fullMonths: 8, months: twelve().slice(4) });
    expect(run(base, { month: withPic(short) })).toContain('expected_income_needed');
    const confirmed = inputsOf({ series: [pay], expectedIncome: [exp('2026-10')] });
    expect(run(confirmed, { month: withPic(short) })).not.toContain('expected_income_needed');
  });

  it('D-35 b: a payment in a calendar month with no kept window month asks', () => {
    const noOct = pic({ months: twelve().filter((m) => m.month !== '2025-10') });
    expect(run(base, { month: withPic(noOct) })).toContain('expected_income_needed');
    const schedule = {
      cadence: { unit: 'month', every: 1 }, count: 3, payment: mu(1_000), finalPayment: mu(1_000), lastPaying: 3, firstDate: '2026-11-15',
      fees: { perPeriod: mu(0), end: mu(0) },
    } as unknown as Purchase['schedule'];
    const gapNov = pic({ months: twelve().filter((m) => m.month !== '2025-11') });
    expect(run(base, { month: withPic(gapNov), purchase: purchase({ schedule, monthly: mu(1_000) }) })).toContain('expected_income_needed');
    expect(run(base, { month: withPic(gapNov), purchase: purchase() })).not.toContain('expected_income_needed');
  });

  it('D-35 variable: 12 months not asked, 6 months asked; steady and absent picture never', () => {
    const v = (n: number) => pic({ treated: 'variable', stated: 'variable', fullMonths: n, months: twelve().slice(12 - n) });
    expect(run(base, { month: withPic(v(12)) })).not.toContain('expected_income_needed');
    expect(run(base, { month: withPic(v(6)) })).toContain('expected_income_needed');
    expect(run(base, { month: withPic(pic({ treated: 'steady', stated: 'steady', months: [], fullMonths: 3 })) })).not.toContain('expected_income_needed');
    expect(run(base)).not.toContain('expected_income_needed');
  });

  it('D-35 a running monthly cost depends on the months ahead too', () => {
    const noMar = pic({ months: twelve().filter((m) => m.month.slice(5) !== '03') });
    expect(run(base, { month: withPic(noMar), purchase: purchase({ runningMonthly: mu(500) }) })).toContain('expected_income_needed');
    expect(run(base, { month: withPic(noMar), purchase: purchase({ runningMonthly: mu(0) }) })).not.toContain('expected_income_needed');
  });

  it('D-50 money above the threshold asks; at or below does not; unspent not confirmed asks only that', () => {
    const t = base.thresholds.unspentDrift;
    expect(run(base, { funds: { ...funds(), unexplained: mu(t + 1) } })).toEqual(['unexplained_money_question']);
    expect(run(base, { funds: { ...funds(), unexplained: mu(t) } })).toEqual([]);
    expect(run(base, { funds: { ...funds(), unexplained: mu(0) } })).toEqual([]);
    expect(run(base, { funds: funds(null), purchase: purchase({ dayOne: mu(50_001) }) })).toEqual(['unspent_not_confirmed']);
  });

  it('D-54 an account with no stated use asks the account-use question', () => {
    expect(run(base, { funds: { ...funds(), unstatedAccounts: ['a1'] } })).toEqual(['account_use_question']);
    expect(run(base, { funds: { ...funds(), unstatedAccounts: [] } })).toEqual([]);
  });

  it('D-62 an unlinked emergency fund with every account stated still asks account_use_question', () => {
    expect(run(base, { funds: { ...funds(), unstatedAccounts: [], fundUnlinked: true } })).toEqual(['account_use_question']);
    expect(run(base, { funds: { ...funds(), unstatedAccounts: [], fundUnlinked: false } })).toEqual([]);
  });

  it('D-58 an unanswered unseen pay asks; an answered one does not', () => {
    const u = (arrived: boolean | null) => ({ seriesId: 'p', date: '2026-10-01', amount: mu(400_000), arrived });
    expect(run(base, { month: month({ unseenPay: [u(null)] }) })).toEqual(['pay_arrival_question']);
    expect(run(base, { month: month({ unseenPay: [u(true)] }) })).toEqual([]);
    expect(run(base, { month: month({ unseenPay: [u(false)] }) })).toEqual([]);
    expect(run(base, { month: month({ unseenPay: [u(false), u(null)] }) })).toEqual(['pay_arrival_question']);
  });

  it('D-59 several codes come back in priority order, not alphabetical', () => {
    const r = run(base, {
      month: month({ e: null, unseenPay: [{ seriesId: 'p', date: '2026-10-01', amount: mu(1), arrived: null }] }),
      funds: { ...funds(), unstatedAccounts: ['a1'], unexplained: mu(base.thresholds.unspentDrift + 1) },
    });
    expect(r).toEqual(['account_use_question', 'pay_arrival_question', 'unexplained_money_question', 'everyday_unknown']);
  });
});
