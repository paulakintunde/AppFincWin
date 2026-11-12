/** 06.1 FIN-20 (owner D-26, 2026-11-12): the tax set-aside pre-pass (income/setAside.ts). Cases TX-10 .. TX-15 run in the table. */
import { minorUnits } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import { MAX_TAX_SET_ASIDE_BP, percentText, setAsideBpOf, shareOf, withTaxSetAside } from '../../income/setAside';
import { judgeWithQuickLines } from '../../quick/overlay';
import { prepare } from '../../prepare';
import type { IncomeProfile, V3Inputs } from '../../types';
import { ASOF, checkOnce, inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';

const mu = minorUnits;
const freelance: IncomeProfile = { types: ['freelance'], variable: 'steady', steady: mu(400_000), billsHorizonMonths: null };
const salaryAndFreelance: IncomeProfile = { types: ['salary', 'freelance'], variable: 'steady', steady: null, billsHorizonMonths: null };
const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: 250_000 });

/** ASOF is 2026-10-03: September in full, October so far. */
function base(over: Partial<V3Inputs> = {}): V3Inputs {
  return inputsOf({
    profile: freelance,
    taxSetAsideBp: 2500,
    balance: mu(500_000),
    unspent: { amount: mu(300_000), at: ASOF },
    accounts: [
      { id: 's', balance: mu(100_000), use: { kind: 'untouched' } },
      { id: 'a', balance: mu(500_000), use: { kind: 'everyday' } },
    ],
    months: [
      monthOf('2026-09', [v3Line({ id: 'f9', date: '2026-09-01', amount: 400_000, role: 'income' })]),
      monthOf('2026-10', [v3Line({ id: 'f10', date: '2026-10-01', amount: 400_000, role: 'income' })], { full: false }),
    ],
    ...over,
  });
}

describe('FIN-20 setAsideBpOf: the share in force', () => {
  it('FIN-20 freelance ticked and a share typed: the share, clamped to 0 .. 60%', () => {
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: 2500 })).toBe(2500);
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: 9000 })).toBe(MAX_TAX_SET_ASIDE_BP);
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: -5 })).toBe(0);
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: 1250.7 })).toBe(1250);
  });
  it('FIN-20 nothing typed, 0%, no profile, mix alone or commission: none', () => {
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: null })).toBe(0);
    expect(setAsideBpOf({ profile: freelance })).toBe(0);
    expect(setAsideBpOf({ profile: freelance, taxSetAsideBp: 0 })).toBe(0);
    expect(setAsideBpOf({ profile: null, taxSetAsideBp: 2500 })).toBe(0);
    expect(setAsideBpOf({ profile: { ...freelance, types: ['mix'] }, taxSetAsideBp: 2500 })).toBe(0);
    expect(setAsideBpOf({ profile: { ...freelance, types: ['commission'] }, taxSetAsideBp: 2500 })).toBe(0);
  });
});

describe('FIN-20 shareOf and percentText', () => {
  it('FIN-20 the share of one payment is rounded half up to the minor unit', () => {
    expect(shareOf(400_000, 2500)).toBe(100_000);
    expect(shareOf(2, 2500)).toBe(1); // 0.5 rounds up
    expect(shareOf(1, 2500)).toBe(0);
  });
  it('FIN-20 the percent reads as plain text', () => {
    expect(percentText(2500)).toBe('25');
    expect(percentText(1250)).toBe('12.5');
    expect(percentText(1234)).toBe('12.34');
    expect(percentText(5)).toBe('0.05');
  });
});

describe('FIN-20 withTaxSetAside', () => {
  it('FIN-20 with nothing in force the inputs are as given (the share cleared when one was set)', () => {
    const plain = inputsOf();
    expect(withTaxSetAside(plain)).toEqual({ inputs: plain, fact: null });
    const zero = base({ taxSetAsideBp: 0 });
    expect(withTaxSetAside(zero)).toEqual({ inputs: { ...zero, taxSetAsideBp: null }, fact: null });
  });

  it('FIN-20 freelance pay is cut, this month\'s share held back from the balance, the everyday account and the confirmed figure', () => {
    const { inputs, fact } = withTaxSetAside(base());
    expect(inputs.taxSetAsideBp).toBeNull();
    expect(inputs.months.map((m) => m.lines[0]?.amount)).toEqual([300_000, 300_000]);
    expect(inputs.profile?.steady).toBe(300_000);
    expect(inputs.balance).toBe(400_000);
    expect(inputs.accounts?.map((a) => a.balance)).toEqual([100_000, 400_000]);
    expect(inputs.unspent).toEqual({ amount: 200_000, at: ASOF });
    expect(fact).toEqual({ code: 'tax_set_aside', values: { percent: '25', amount: 100_000 } });
  });

  it('FIN-20 only this month\'s paid freelance pay on or before today is held back; a figure confirmed before it arrived keeps all', () => {
    const later = v3Line({ id: 'f-late', date: '2026-10-20', amount: 40_000, role: 'income' });
    const pending = v3Line({ id: 'f-pend', date: '2026-10-02', amount: 40_000, role: 'income', status: 'pending' });
    const months = [monthOf('2026-10', [v3Line({ id: 'f10', date: '2026-10-02', amount: 400_000, role: 'income' }), later, pending], { full: false })];
    const { inputs } = withTaxSetAside(base({ months, unspent: { amount: mu(300_000), at: '2026-10-01' } }));
    expect(inputs.months[0]?.lines.map((l) => l.amount)).toEqual([300_000, 30_000, 30_000]);
    expect(inputs.balance).toBe(400_000);
    expect(inputs.unspent?.amount).toBe(300_000);
  });

  it('FIN-20 salary is never cut; the profile\'s own variable income is, and the fact names this month\'s share with no steady figure', () => {
    const months = [
      monthOf('2026-10', [
        v3Line({ id: 'sal', date: '2026-10-01', amount: 250_000, role: 'income', seriesId: 'pay' }),
        v3Line({ id: 'fl', date: '2026-10-02', amount: 150_000, role: 'income' }),
        v3Line({ id: 'rent', date: '2026-10-02', amount: 50_000, role: 'income', incomeKind: { kind: 'preset', value: 'rental' } as never }),
        v3Line({ id: 'gift', date: '2026-10-02', amount: 50_000, role: 'income', countsAs: 'available' }),
        v3Line({ id: 'shop', date: '2026-10-02', amount: 9_000 }),
      ], { full: false }),
    ];
    const { inputs, fact } = withTaxSetAside(base({ profile: salaryAndFreelance, series: [pay], months, unspent: null, accounts: undefined }));
    expect(inputs.months[0]?.lines.map((l) => l.amount)).toEqual([250_000, 112_500, 50_000, 50_000, 9_000]);
    expect(inputs.series).toEqual([pay]);
    expect(inputs.profile).toBe(salaryAndFreelance);
    expect(inputs.unspent).toBeNull();
    expect(inputs.accounts).toBeUndefined();
    expect(fact?.values).toEqual({ percent: '25', amount: 37_500 });
  });

  it('FIN-20 a line marked through its series keeps its mark (a kind or a counts-as on the series)', () => {
    const side = v3Series({ id: 'side', role: 'other_income', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-02', amount: 50_000, countsAs: 'available' });
    const kinded = v3Series({ id: 'kinded', role: 'other_income', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-02', amount: 50_000, incomeKind: { kind: 'custom', id: 'k' } });
    const months = [monthOf('2026-10', [
      v3Line({ id: 'a', date: '2026-10-02', amount: 50_000, role: 'income', seriesId: 'side' }),
      v3Line({ id: 'b', date: '2026-10-02', amount: 50_000, role: 'income', seriesId: 'kinded' }),
      v3Line({ id: 'c', date: '2026-10-02', amount: 50_000, role: 'income', seriesId: 'gone' }),
    ], { full: false })];
    const { inputs } = withTaxSetAside(base({ series: [side, kinded], months }));
    expect(inputs.months[0]?.lines.map((l) => l.amount)).toEqual([50_000, 50_000, 37_500]);
  });

  it('FIN-20 with no salary part the pay series and the confirmed expected income are cut too; with a salary part they are not', () => {
    const expectedIncome = [{ month: '2026-11', amount: mu(400_000), at: ASOF }, { month: '2026-12', amount: mu(1), at: ASOF }];
    const bill = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: 100_000 });
    const tiny = v3Series({ id: 'tiny', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: 1 });
    const own = withTaxSetAside(base({ series: [pay, bill, tiny], expectedIncome }));
    expect(own.inputs.series.map((s) => s.amount)).toEqual([187_500, 100_000, 1]);
    expect(own.inputs.expectedIncome?.map((e) => e.amount)).toEqual([300_000, 1]);
    const withSalary = withTaxSetAside(base({ profile: { ...salaryAndFreelance, steady: mu(150_000) }, series: [pay], expectedIncome }));
    expect(withSalary.inputs.series).toEqual([pay]);
    expect(withSalary.inputs.expectedIncome).toBe(expectedIncome);
    expect(withSalary.fact?.values).toEqual({ percent: '25', amount: 37_500 });
  });

  it('FIN-20 a share that rounds to 0 everywhere changes nothing and adds no fact; with no everyday account only the balance moves', () => {
    const tinyMonths = [monthOf('2026-10', [v3Line({ id: 't', date: '2026-10-01', amount: 1, role: 'income' })], { full: false })];
    const none = withTaxSetAside(base({ months: tinyMonths, profile: { ...freelance, steady: null } }));
    expect(none.fact).toBeNull();
    expect(none.inputs.months).toEqual(tinyMonths);
    const noEveryday = withTaxSetAside(base({ accounts: [{ id: 's', balance: mu(100_000), use: null }] }));
    expect(noEveryday.inputs.accounts?.[0]?.balance).toBe(100_000);
    expect(noEveryday.inputs.balance).toBe(400_000);
  });
});

describe('FIN-20 through prepare', () => {
  it('FIN-20 the fact is on an answer the share changed, never on an ask, and the quick-line overlay never cuts twice', () => {
    const inputs = base({ unspent: null });
    const e = evaluate(inputs, checkOnce(10_000));
    expect(e.result.facts.filter((f) => f.code === 'tax_set_aside')).toHaveLength(1);
    const ask = evaluate(inputs, checkOnce(0, { price: null }));
    expect(ask.result.code).toBe('needs_input');
    expect(ask.result.facts.some((f) => f.code === 'tax_set_aside')).toBe(false);
    const p = prepare(inputs);
    expect(p.inputs.taxSetAsideBp).toBeNull();
    const quick = judgeWithQuickLines(p, checkOnce(10_000, { quickLines: [{ id: 'q', kind: 'expense', name: 'q', amount: mu(1_000), everyMonths: 0, date: null }] }));
    expect(quick.result.facts.filter((f) => f.code === 'tax_set_aside')).toHaveLength(1);
    expect(prepare(p.inputs).inputs.months).toEqual(p.inputs.months);
    const none = evaluate(inputsOf(), checkOnce(10_000));
    expect(none.result.facts.some((f) => f.code === 'tax_set_aside')).toBe(false);
  });
});
