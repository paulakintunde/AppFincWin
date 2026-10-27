import { minorUnits, type MinorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import type { Funds, MonthModel, Purchase, UnspentState, V3Inputs } from '../../types';
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

  it('purchase-missing passes through, result unique and sorted', () => {
    const r = needsInput({
      inputs: inputsOf({ series: [pay] }), month: month(), funds: funds(), purchase: purchase(),
      purchaseMissing: ['plan_rate_missing', 'no_price', 'no_price'],
    });
    expect(r).toEqual(['no_price', 'plan_rate_missing']);
  });

  it('v3 §12 #13 Jordan', () => {
    expect(run(inputsOf(), { month: month({ e: null }), purchase: null })).toContain('no_income_figures');
  });
});
