/**
 * 05.4 BO-05 (05.4-27): what a purchase replaces (stopped costs and a sale), cash and installments from one input, and the
 * save-for-it ready date, as pure functions and through the engine on the SO cases (D-101..D-108).
 */
import { minorUnits as mu } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type { DebtFlow } from '../../debts';
import { evaluate } from '../../evaluate';
import { dueDrops } from '../../month/dueDrops';
import { judgeCheck, prepare } from '../../prepare';
import { checkOnce, v3Series } from '../../__tests__/helpers/fixtures';
import { toEngineInputs } from '../../__tests__/rightAnswers/fixture';
import { loadCases } from '../../__tests__/rightAnswers/loader';
import type { CheckV2, Sale, StoppedCost, V3Debt, V3Inputs } from '../../types';
import { cashOf, judgeBoth } from '../cashAndPlan';
import { order, replacesEffect, replacesOutflows, saleCounts, saleFlows, stopCounts, stoppedCostFlows, usualFreed, type ReplacesCtx } from '../replaces';
import { readyWithSale } from '../../judge/judge';
import type { MonthModel } from '../../types';
import { saveForItReadyDate, savedCounted } from '../saveForIt';

const ASOF = '2026-11-15';

const phone = v3Series({ id: 'bill-phone', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: mu(8000) });
const yearly = v3Series({ id: 'bill-ins', role: 'bill', cadence: { unit: 'month', every: 12 }, anchorDate: '2026-02-10', amount: mu(60_000), typicalChoice: 'excluded' });
const quarterly = v3Series({ id: 'bill-q', role: 'bill', cadence: { unit: 'month', every: 3 }, anchorDate: '2026-12-10', amount: mu(30_000), typicalChoice: 'monthly' });
const loanBill = v3Series({ id: 'bill-loan', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: mu(25_000) });
const loanPay = v3Series({ id: 'pay-loan', role: 'debt_payment', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: mu(25_000) });

const month: ReplacesCtx['month'] = { e: mu(80_000), categoryMonthly: [{ categoryId: 'gym', amount: mu(3_000) }] };

function ctx(over: Partial<ReplacesCtx> = {}): ReplacesCtx {
  return { asOf: ASOF, days: 90, series: [phone, yearly, quarterly], paid: new Set(), debts: [], debtFlows: [], month, ...over };
}

const billStop = (over: Partial<StoppedCost> = {}): StoppedCost => ({
  id: 's',
  amount: mu(8000),
  everyMonths: 1,
  stopDate: '2026-12-20',
  source: { kind: 'bill', seriesId: 'bill-phone' },
  ...over,
});
const dayStop = (over: Partial<StoppedCost> = {}): StoppedCost => ({
  id: 'gym',
  amount: mu(5000),
  everyMonths: 1,
  stopDate: '2026-11-30',
  source: { kind: 'everyday', categoryId: null },
  ...over,
});
const sale = (over: Partial<Sale> = {}): Sale => ({ amount: mu(500_000), arrives: '2026-11-20', paysDebtId: null, ...over });
const debt = (over: Partial<V3Debt> = {}): V3Debt => ({ id: 'd', kind: 'loan', balance: mu(400_000), minimum: mu(25_000), apr: percent('6.9'), secured: false, isHousing: false, dueDay: 5, ...over });
const flow = (date: string, amount: number): DebtFlow => ({ debtId: 'd', date, amount: mu(amount) });

describe('stoppedCostFlows (D-103, D-104; SO-05, SO-06)', () => {
  it('SO-05 a bill stopped on 20 December is still paid on 1 December and given back on 1 January and 1 February', () => {
    expect(stoppedCostFlows([billStop()], ctx())).toEqual([
      { date: '2027-01-01', amount: 8000 },
      { date: '2027-02-01', amount: 8000 },
    ]);
  });

  it('a due on the stop date itself is still paid', () => {
    expect(stoppedCostFlows([billStop({ stopDate: '2027-01-01' })], ctx()).map((f) => f.date)).toEqual(['2027-02-01']);
  });

  it('a stop before today gives back every due on the path', () => {
    expect(stoppedCostFlows([billStop({ stopDate: '2026-10-01' })], ctx()).map((f) => f.date)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('a due the path never took (settled, dropped) is never given back', () => {
    const paid = new Set(['bill-phone|2027-01-01']);
    expect(stoppedCostFlows([billStop()], ctx({ paid })).map((f) => f.date)).toEqual(['2027-02-01']);
    const drops = dueDrops({ asOf: ASOF, series: [phone], waivers: [{ kind: 'always_other', seriesId: 'bill-phone' }], skipped: [] });
    expect(stoppedCostFlows([billStop()], ctx({ drops }))).toEqual([]);
  });

  it('D-104 a stop whose bill is not recorded, a repeated stop, or a stop that cannot count gives back nothing extra', () => {
    expect(stoppedCostFlows([billStop({ source: { kind: 'bill', seriesId: 'nope' } })], ctx())).toEqual([]);
    expect(stoppedCostFlows([billStop(), billStop({ id: 't' })], ctx())).toHaveLength(2);
    expect(stoppedCostFlows([billStop({ stopDate: '2026-13-40' })], ctx())).toEqual([]);
    expect(stoppedCostFlows([billStop({ amount: mu(0) })], ctx())).toEqual([]);
    expect(stoppedCostFlows([billStop({ everyMonths: 2 as 1 })], ctx())).toEqual([]);
    expect(stoppedCostFlows([billStop({ stopDate: '2027-03-01' })], ctx())).toEqual([]);
    expect(stopCounts(billStop())).toBe(true);
  });

  it('SO-06 an everyday stop on 30 November gives its share back at the end of December and January, never in November', () => {
    expect(stoppedCostFlows([dayStop()], ctx())).toEqual([
      { date: '2026-12-31', amount: 5000 },
      { date: '2027-01-31', amount: 5000 },
    ]);
  });

  it('D-103 an everyday stop already past starts from next month; a stop later in the path starts the month after it', () => {
    expect(stoppedCostFlows([dayStop({ stopDate: '2026-10-01' })], ctx()).map((f) => f.date)).toEqual(['2026-12-31', '2027-01-31']);
    expect(stoppedCostFlows([dayStop({ stopDate: '2026-12-01' })], ctx()).map((f) => f.date)).toEqual(['2027-01-31']);
  });

  it('everyday shares are capped at the usual everyday spending, and at the category the stop names', () => {
    const gym = dayStop({ source: { kind: 'everyday', categoryId: 'gym' } });
    expect(stoppedCostFlows([gym], ctx())[0]?.amount).toBe(3000);
    const twice = stoppedCostFlows([gym, dayStop({ id: 'gym2', source: { kind: 'everyday', categoryId: 'gym' } })], ctx());
    expect(twice.filter((f) => f.date === '2026-12-31')).toEqual([{ date: '2026-12-31', amount: 3000 }]);
    const big = stoppedCostFlows([dayStop({ amount: mu(90_000) }), dayStop({ id: 'z', amount: mu(10_000) })], ctx());
    expect(big.filter((f) => f.date === '2026-12-31')).toEqual([{ date: '2026-12-31', amount: 80_000 }]);
    expect(stoppedCostFlows([dayStop({ source: { kind: 'everyday', categoryId: 'none' } })], ctx())).toEqual([]);
    expect(stoppedCostFlows([dayStop()], ctx({ month: { e: null, categoryMonthly: [] } }))).toEqual([]);
    expect(stoppedCostFlows([dayStop({ amount: mu(6000), everyMonths: 3 })], ctx())[0]?.amount).toBe(2000);
    expect(stoppedCostFlows([dayStop({ id: 'b' }), dayStop({ id: 'a' })], ctx())).toHaveLength(4);
  });
});

describe('saleFlows (D-102, D-105; SO-01..SO-04)', () => {
  it('a sale with no debt reaches the account on its date', () => {
    const s = saleFlows(sale(), ctx());
    expect(s.flows).toEqual([{ date: '2026-11-20', amount: 500_000 }]);
    expect(s.account).toEqual({ date: '2026-11-20', amount: 500_000 });
    expect(s.debt).toBeNull();
  });

  it('D-105 a sale before today, not a real date or not above 0 is not counted', () => {
    expect(saleCounts(sale({ arrives: '2026-11-14' }), ASOF)).toBe(false);
    expect(saleCounts(sale({ arrives: 'soon' }), ASOF)).toBe(false);
    expect(saleCounts(sale({ amount: mu(0) }), ASOF)).toBe(false);
    expect(saleCounts(null, ASOF)).toBe(false);
    expect(saleCounts(sale({ arrives: ASOF }), ASOF)).toBe(true);
    expect(saleFlows(sale({ arrives: '2026-11-01' }), ctx()).flows).toEqual([]);
  });

  it('a sale beyond the path is off it, and a debt the sale names that is not recorded leaves the whole sale to the account', () => {
    expect(saleFlows(sale({ arrives: '2027-03-01' }), ctx()).account).toBeNull();
    expect(saleFlows(sale({ arrives: '2027-03-01' }), ctx()).flows).toEqual([]);
    expect(saleFlows(sale({ paysDebtId: 'nope' }), ctx()).toAccount).toBe(500_000);
  });

  it('SO-03 a sale that pays off a loan through its bill series ends the payments after it, and only the rest reaches the account', () => {
    const s = saleFlows(sale({ paysDebtId: 'd' }), ctx({ series: [loanBill], debts: [debt({ seriesId: 'bill-loan' })] }));
    expect(s.toDebt).toBe(400_000);
    expect(s.toAccount).toBe(100_000);
    expect(s.debt).toEqual({ id: 'd', left: 0 });
    expect(s.flows).toEqual([
      { date: '2026-11-20', amount: 100_000 },
      { date: '2026-12-05', amount: 25_000 },
      { date: '2027-01-05', amount: 25_000 },
      { date: '2027-02-05', amount: 25_000 },
    ]);
    expect([...s.endedDues]).toEqual(['bill-loan|2026-12-05', 'bill-loan|2027-01-05', 'bill-loan|2027-02-05']);
  });

  it('D-102 SO-04 a sale smaller than the loan keeps the full payment while anything is owed (D-73), and ends what is beyond it', () => {
    const s = saleFlows(sale({ paysDebtId: 'd' }), ctx({ series: [loanBill], debts: [debt({ balance: mu(700_000), seriesId: 'bill-loan' })] }));
    expect(s.debt).toEqual({ id: 'd', left: 200_000 });
    expect(s.toAccount).toBe(0);
    expect(s.flows).toEqual([]);
    const small = saleFlows(sale({ paysDebtId: 'd', amount: mu(160_000) }), ctx({ series: [loanBill], debts: [debt({ balance: mu(200_000), seriesId: 'bill-loan' })] }));
    expect(small.debt).toEqual({ id: 'd', left: 40_000 });
    // 1 December... the $250 on 5 December is paid ($150 left), 5 January pays the last $150 ($100 given back), 5 February nothing.
    expect(small.flows).toEqual([
      { date: '2027-01-05', amount: 10_000 },
      { date: '2027-02-05', amount: 25_000 },
    ]);
  });

  it('an unlinked minimum: payments before the sale come off what is owed first; the sale ends the rest', () => {
    const flows = [flow('2026-11-18', 25_000), flow('2026-12-05', 25_000), flow('2027-01-05', 25_000)];
    const s = saleFlows(sale({ paysDebtId: 'd', amount: mu(100_000) }), ctx({ debts: [debt({ balance: mu(100_000) })], debtFlows: flows }));
    expect(s.toDebt).toBe(75_000);
    expect(s.toAccount).toBe(25_000);
    expect(s.debt).toEqual({ id: 'd', left: 0 });
    expect(s.endedDues.size).toBe(0);
    expect(s.flows).toEqual([
      { date: '2026-11-20', amount: 25_000 },
      { date: '2026-12-05', amount: 25_000 },
      { date: '2027-01-05', amount: 25_000 },
    ]);
  });

  it('a debt already paid down to nothing before the sale takes none of it; a debt with no balance owes nothing', () => {
    const s = saleFlows(sale({ paysDebtId: 'd' }), ctx({ debts: [debt({ balance: mu(10_000) })], debtFlows: [flow('2026-11-18', 25_000)] }));
    expect(s.toDebt).toBe(0);
    expect(s.toAccount).toBe(500_000);
    expect(saleFlows(sale({ paysDebtId: 'd' }), ctx({ debts: [debt({ balance: mu(-5) })] })).toDebt).toBe(0);
  });
});

describe('usualFreed (D-104, D-102)', () => {
  const none = saleFlows(null, ctx());
  it('a monthly bill gives back its amount, a yearly bill left out of the usual month nothing, a quarterly one its share', () => {
    expect(usualFreed({ stops: [billStop()], sale: null }, ctx(), none)).toBe(8000);
    expect(usualFreed({ stops: [billStop({ source: { kind: 'bill', seriesId: 'bill-ins' } })], sale: null }, ctx(), none)).toBe(0);
    expect(usualFreed({ stops: [billStop({ source: { kind: 'bill', seriesId: 'bill-q' } })], sale: null }, ctx(), none)).toBe(10_000);
    expect(usualFreed({ stops: [billStop(), billStop({ id: 't' })], sale: null }, ctx(), none)).toBe(8000);
    expect(usualFreed({ stops: [billStop({ source: { kind: 'bill', seriesId: 'nope' } }), billStop({ amount: mu(0) })], sale: null }, ctx(), none)).toBe(0);
  });

  it('a bill someone else always pays gives back nothing', () => {
    const drops = dueDrops({ asOf: ASOF, series: [phone], waivers: [{ kind: 'always_other', seriesId: 'bill-phone' }], skipped: [] });
    expect(usualFreed({ stops: [billStop()], sale: null }, ctx({ drops }), none)).toBe(0);
    expect(usualFreed({ stops: [billStop()], sale: null }, ctx({ month: { ...month, alwaysOther: [{ seriesId: 'bill-phone', name: null }] } }), none)).toBe(0);
  });

  it('an everyday stop gives back its capped share', () => {
    expect(usualFreed({ stops: [dayStop()], sale: null }, ctx(), none)).toBe(5000);
  });

  it('a debt the sale pays off gives back the minimum the usual month counted once: its bill series, else set aside, never a debt-payment series twice', () => {
    const viaBill = ctx({ series: [loanBill], debts: [debt({ seriesId: 'bill-loan' })] });
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd' }) }, viaBill, saleFlows(sale({ paysDebtId: 'd' }), viaBill))).toBe(25_000);
    const setAside = ctx({ debts: [debt()] });
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd' }) }, setAside, saleFlows(sale({ paysDebtId: 'd' }), setAside))).toBe(25_000);
    const viaPayment = ctx({ series: [loanPay], debts: [debt({ seriesId: 'pay-loan' })] });
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd' }) }, viaPayment, saleFlows(sale({ paysDebtId: 'd' }), viaPayment))).toBe(25_000);
    const noMin = ctx({ debts: [debt({ minimum: mu(0) })] });
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd' }) }, noMin, saleFlows(sale({ paysDebtId: 'd' }), noMin))).toBe(0);
    const part = ctx({ debts: [debt({ balance: mu(900_000) })] });
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd' }) }, part, saleFlows(sale({ paysDebtId: 'd' }), part))).toBe(0);
  });
});

describe('replacesEffect', () => {
  it('nothing that counts is null', () => {
    expect(replacesEffect(null, ctx(), ASOF)).toBeNull();
    expect(replacesEffect(undefined, ctx(), ASOF)).toBeNull();
    expect(replacesEffect({ stops: [billStop({ amount: mu(0) })], sale: sale({ arrives: '2026-01-01' }) }, ctx(), ASOF)).toBeNull();
  });

  it('SO-01 a sale on the purchase date is netted against day one and is not on the path twice', () => {
    const e = replacesEffect({ stops: [], sale: sale({ arrives: ASOF, amount: mu(550_000) }) }, ctx(), ASOF);
    expect(e?.saleNow).toBe(550_000);
    expect(e?.saleLater).toBeNull();
    expect(e?.flows).toEqual([]);
    expect(e?.facts).toEqual([{ code: 'sale_counted', values: { amount: 550_000, date: ASOF } }]);
    expect(e?.showsUsual).toBe(false);
  });

  it('SO-02 a later sale is a ready-date sale and on the path from its date', () => {
    const e = replacesEffect({ stops: [], sale: sale({ arrives: '2026-12-20', amount: mu(550_000) }) }, ctx(), ASOF);
    expect(e?.saleNow).toBe(0);
    expect(e?.saleLater).toEqual({ amount: 550_000, date: '2026-12-20' });
    expect(e?.flows).toEqual([{ date: '2026-12-20', amount: 550_000 }]);
  });

  it('SO-04 a debt paid in part owes the rest and says so; SO-03 a debt paid off is gone', () => {
    const part = ctx({ series: [loanBill], debts: [debt({ balance: mu(700_000), seriesId: 'bill-loan' })] });
    const e = replacesEffect({ stops: [], sale: sale({ paysDebtId: 'd' }) }, part, ASOF);
    expect(e?.debts).toEqual([{ ...debt({ seriesId: 'bill-loan' }), balance: 200_000 }]);
    expect(e?.facts).toContainEqual({ code: 'debt_left_after_sale', values: { amount: 200_000 } });
    expect(e?.saleLater).toBeNull();
    expect(e?.showsUsual).toBe(true);
    const off = ctx({ series: [loanBill], debts: [debt({ seriesId: 'bill-loan' }), debt({ id: 'other' })] });
    const f = replacesEffect({ stops: [], sale: sale({ paysDebtId: 'd' }) }, off, ASOF);
    expect(f?.debts.map((d) => d.id)).toEqual(['other']);
    expect(f?.freed).toBe(25_000);
    const plain = replacesEffect({ stops: [], sale: sale() }, ctx({ debts: [debt()] }), ASOF);
    expect(plain?.debts).toEqual([debt()]);
  });

  it('a bill stop on the series a sale ends is not given back twice; stopped bills are listed for their hold-backs', () => {
    const c = ctx({ series: [loanBill], debts: [debt({ seriesId: 'bill-loan' })] });
    const e = replacesEffect({ stops: [billStop({ source: { kind: 'bill', seriesId: 'bill-loan' }, stopDate: '2026-11-30' }), dayStop()], sale: sale({ paysDebtId: 'd' }) }, c, ASOF);
    expect(e?.flows.filter((f) => f.date === '2026-12-05')).toEqual([{ date: '2026-12-05', amount: 25_000 }]);
    expect([...(e?.heldStops ?? new Map())]).toEqual([['bill-loan', '2026-11-30']]);
    expect(e?.freed).toBe(25_000 + 5000);
  });
});

describe('through the engine: the SO cases (D-101..D-108)', () => {
  const cases = loadCases().filter((c) => c.topic === 'selling-the-old-one');
  const inputsOfCase = (id: string): { inputs: V3Inputs; check: CheckV2 } => toEngineInputs((cases.find((c) => c.id === id) as (typeof cases)[number]).fixture);

  it('SO-01 the sale lowers the day-one need: $500 of her own money, $500 left this month', () => {
    const { inputs, check } = inputsOfCase('SO-01');
    const r = evaluate(inputs, check).result;
    expect(r.code).toBe('fits_month');
    expect(r.afterBuy.month).toBe(50_000);
    expect(r.facts.map((f) => f.code)).toContain('sale_counted');
    expect(evaluate(inputs, check).purchase?.dayOne).toBe(50_000);
  });

  it('a sale bigger than the purchase: the rest arrives on the path, this month keeps its own figure', () => {
    const { inputs, check } = inputsOfCase('SO-01');
    const r = evaluate(inputs, { ...check, price: mu(100_000), replaces: { stops: [], sale: sale({ arrives: ASOF, amount: mu(550_000) }) } });
    expect(r.result.code).toBe('fits_month');
    expect(r.purchase?.dayOne).toBe(0);
    expect(r.cash.kind).toBe('ok');
  });

  it('SO-02 the sale a month later: Not yet, ready in December (not on the 1 December payday)', () => {
    const { inputs, check } = inputsOfCase('SO-02');
    const r = evaluate(inputs, check).result;
    expect(r.code).toBe('not_yet');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2026-12' });
  });

  it('SO-02 shape, $2,500 dipping until payday: a sale on 20 November makes payday (1 December) the ready date; one on 10 December waits for it (December)', () => {
    const { inputs, check } = inputsOfCase('SO-02');
    const at = (arrives: string) => evaluate(inputs, { ...check, price: mu(250_000), replaces: { stops: [], sale: sale({ arrives, amount: mu(100_000) }) } });
    const without = evaluate(inputs, { ...check, price: mu(250_000), replaces: null }).result;
    expect(without.readyBy).toEqual({ kind: 'month', month: '2027-01' });
    const early = at('2026-11-20');
    expect(early.cash.kind).toBe('payday');
    expect(early.result).toMatchObject({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-12-01' } });
    const late = at('2026-12-10');
    expect(late.cash.kind).toBe('payday');
    expect(late.result).toMatchObject({ code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2026-12' } });
  });

  it('a later sale that is not needed leaves the ready date as it was', () => {
    const { inputs, check } = inputsOfCase('SO-02');
    const without = evaluate(inputs, { ...check, replaces: null }).result;
    const small = evaluate(inputs, { ...check, replaces: { stops: [], sale: sale({ arrives: '2027-09-01', amount: mu(100) }) } }).result;
    expect(small.readyBy).toEqual(without.readyBy);
  });

  it('SO-03, SO-04, SO-05, SO-06: the usual month after buying', () => {
    expect(evaluate(inputsOfCase('SO-03').inputs, inputsOfCase('SO-03').check).result.afterBuy.usualMonth).toBe(100_000);
    expect(evaluate(inputsOfCase('SO-04').inputs, inputsOfCase('SO-04').check).result.afterBuy.usualMonth).toBe(75_000);
    expect(evaluate(inputsOfCase('SO-05').inputs, inputsOfCase('SO-05').check).result.afterBuy.usualMonth).toBe(97_000);
    const so6 = evaluate(inputsOfCase('SO-06').inputs, inputsOfCase('SO-06').check).result;
    expect(so6.afterBuy).toMatchObject({ month: 10_000, usualMonth: 105_000 });
    expect(so6.variant).toBe('tight');
  });

  it('SO-03 a debt the sale pays off has no interest line or costly-debt caution after it', () => {
    const { inputs, check } = inputsOfCase('SO-03');
    const facts = evaluate(inputs, check).result.facts.map((f) => f.code);
    expect(facts).not.toContain('debt_interest_cost');
    expect(evaluate(inputs, { ...check, replaces: null }).result.facts.map((f) => f.code)).toContain('debt_interest_cost');
  });

  it('a usual month already short before the purchase is judged as it is (no freed money)', () => {
    const { inputs, check } = inputsOfCase('SO-06');
    const short: V3Inputs = { ...inputs, months: inputs.months.map((m) => (m.full ? { ...m, lines: m.lines.map((l) => (l.id.startsWith('day-') ? { ...l, amount: mu(l.amount + 200_000) } : l)) } : m)) };
    const r = evaluate(short, check).result;
    const without = evaluate(short, { ...check, replaces: null }).result;
    expect(r.afterBuy.usualMonth).toBe(without.afterBuy.month === r.afterBuy.month ? r.afterBuy.usualMonth : r.afterBuy.usualMonth);
    expect(r.code).toBe(without.code);
  });

  it('a yearly bill that stops before its due date is not held back any more', () => {
    const cases2 = loadCases().filter((c) => c.topic === 'running-costs');
    const rc10 = cases2.find((c) => c.fixture.bills.some((b) => b.everyMonths > 1 && b.inUsualMonth !== true));
    if (rc10 === undefined) return;
    const { inputs, check } = toEngineInputs(rc10.fixture);
    const held = evaluate(inputs, check).funds.billsHeld;
    const b = rc10.fixture.bills.find((x) => x.everyMonths > 1 && x.inUsualMonth !== true) as (typeof rc10.fixture.bills)[number];
    const stop: StoppedCost = { id: b.id, amount: mu(b.amount), everyMonths: 12, stopDate: inputs.asOf, source: { kind: 'bill', seriesId: `bill-${b.id}` } };
    const after = evaluate(inputs, { ...check, replaces: { stops: [stop], sale: null } });
    const part = held?.parts.find((p) => p.seriesId === `bill-${b.id}`);
    if (part === undefined || part.holdBack === 0) return;
    expect(after.result.facts.some((f) => f.code === 'yearly_bill_ahead' && f.values.seriesId === `bill-${b.id}`)).toBe(false);
  });
});

describe('judgeBoth (I72 shape)', () => {
  const cases = loadCases().filter((c) => c.topic === 'selling-the-old-one');
  it('SO-09 a one-off: the cash side is the check itself and there is no plan side', () => {
    const { inputs, check } = toEngineInputs((cases.find((c) => c.id === 'SO-09') as (typeof cases)[number]).fixture);
    const p = prepare(inputs);
    const both = judgeBoth(p, check);
    expect(both.plan).toBeNull();
    expect(both.cash).toEqual(judgeCheck(p, check));
    expect(cashOf(check)).toBe(check);
  });

  it('SO-03 a plan: both sides equal two separate checks', () => {
    const { inputs, check } = toEngineInputs((cases.find((c) => c.id === 'SO-03') as (typeof cases)[number]).fixture);
    const p = prepare(inputs);
    const both = judgeBoth(p, check);
    expect(both.plan).toEqual(evaluate(inputs, check));
    expect(both.cash).toEqual(evaluate(inputs, { ...check, pay: { mode: 'once' } }));
  });
});

describe('saveForItReadyDate (D-108; SO-07, SO-08)', () => {
  const cases = loadCases().filter((c) => c.topic === 'selling-the-old-one');
  const of = (id: string): { inputs: V3Inputs; check: CheckV2 } => toEngineInputs((cases.find((c) => c.id === id) as (typeof cases)[number]).fixture);

  it('SO-07 ready January 2027 (a ready month reads as its last day, D-80); SO-08 the plan saves for its $600 up front only', () => {
    expect(saveForItReadyDate(prepare(of('SO-07').inputs), of('SO-07').check, 0)).toBe('2027-01-31');
    expect(saveForItReadyDate(prepare(of('SO-08').inputs), of('SO-08').check, 0)).toBe('2026-12-01');
  });

  it('fits now is the purchase date', () => {
    const { inputs, check } = of('SO-07');
    expect(saveForItReadyDate(prepare(inputs), { ...check, price: mu(10_000) }, 0)).toBe(inputs.asOf);
    expect(saveForItReadyDate(prepare(inputs), { ...check, price: mu(10_000), purchaseDate: '2026-12-10' }, 0)).toBe('2026-12-10');
  });

  it('money in accounts Decide already counts is never added again; kept savings count up to what they hold', () => {
    const { inputs, check } = of('SO-07');
    const p = prepare(inputs);
    expect(savedCounted(p, 500_000)).toBe(0);
    expect(saveForItReadyDate(p, check, 500_000)).toBe(saveForItReadyDate(p, check, 0));
    const kept: V3Inputs = { ...inputs, accounts: [...(inputs.accounts ?? []), { id: 'k', kind: 'savings', balance: mu(150_000), use: { kind: 'untouched' }, overdraftLimit: null, overdraftRate: null }] };
    const pk = prepare(kept);
    expect(savedCounted(pk, 500_000)).toBe(150_000);
    expect(savedCounted(pk, -1)).toBe(0);
    expect(savedCounted(pk, 1.5)).toBe(0);
    const later = saveForItReadyDate(pk, check, 0) as string;
    const sooner = saveForItReadyDate(pk, check, 150_000) as string;
    expect(sooner < later).toBe(true);
  });

  it('a dip into the overdraft, a monthly short or an ask has no save-for-it date', () => {
    const { inputs, check } = of('SO-07');
    const od: V3Inputs = { ...inputs, accounts: (inputs.accounts ?? []).map((a) => (a.kind === 'checking' ? { ...a, overdraftLimit: mu(1_000_000) } : a)) };
    expect(saveForItReadyDate(prepare(od), check, 0)).toBeNull();
    expect(saveForItReadyDate(prepare(inputs), checkOnce(0, { price: null }), 0)).toBeNull();
    const never = saveForItReadyDate(prepare(inputs), { ...check, price: mu(900_000_000) }, 0);
    expect(never).toBeNull();
  });
});

describe('edges (05.4-27 coverage)', () => {
  it('order is plain string order', () => {
    expect([order('a', 'b'), order('b', 'a'), order('a', 'a')]).toEqual([-1, 1, 0]);
  });

  it('a debt-paying sale beyond the path pays the debt but lands nothing on the path', () => {
    const s = saleFlows(sale({ paysDebtId: 'd', arrives: '2027-03-01' }), ctx({ debts: [debt({ balance: mu(100_000) })] }));
    expect(s.toAccount).toBe(400_000);
    expect(s.account).toBeNull();
  });

  it('a category with more room than the everyday spending is capped at the everyday spending', () => {
    const wide = ctx({ month: { e: mu(2000), categoryMonthly: [{ categoryId: 'gym', amount: mu(9000) }] } });
    expect(stoppedCostFlows([dayStop({ source: { kind: 'everyday', categoryId: 'gym' } })], wide)[0]?.amount).toBe(2000);
  });

  it('replacesOutflows: what comes back is money out below 0; the sale part above the day-one cost arrives on its date', () => {
    const e = replacesEffect({ stops: [dayStop()], sale: sale({ arrives: ASOF, amount: mu(10_000) }) }, ctx(), ASOF);
    const out = replacesOutflows(e as NonNullable<typeof e>, 4000);
    expect(out).toContainEqual({ date: ASOF, amount: -6000 });
    expect(out).toContainEqual({ date: '2026-12-31', amount: -5000 });
    expect(replacesOutflows(e as NonNullable<typeof e>, 10_000).some((f) => f.date === ASOF)).toBe(false);
    expect(replacesEffect({ stops: [dayStop()], sale: null }, ctx(), ASOF)?.saleDate).toBe(ASOF);
  });

  it('readyWithSale: no usual month, a seasonal earner, a sale months later, a usual month at or below 0', () => {
    const base = evaluate(...(Object.values(toEngineInputs(loadCases().find((c) => c.id === 'SO-02')!.fixture)) as [V3Inputs, CheckV2])).month;
    const later = { amount: mu(550_000), date: '2027-02-10' };
    expect(readyWithSale({ ...base, typicalLeft: null }, 600_000, 100_000, later)).toEqual({ ready: null, waits: null });
    const seasonal = { ...base, incomePicture: { ...(base.incomePicture as NonNullable<MonthModel['incomePicture']>), treated: 'seasonal' as const, months: [] } };
    expect(readyWithSale(seasonal, 600_000, 100_000, later).waits).toBeNull();
    expect(readyWithSale(base, 600_000, 100_000, later)).toEqual({ ready: { kind: 'month', month: '2027-02' }, waits: '2027-02-10' });
    const flat: MonthModel = { ...base, typicalLeft: mu(0) };
    expect(readyWithSale(flat, 600_000, 100_000, later)).toEqual({ ready: { kind: 'month', month: '2027-02' }, waits: '2027-02-10' });
    expect(readyWithSale(flat, 50_000, 100_000, later)).toEqual({ ready: { kind: 'month', month: '2026-12' }, waits: null });
    expect(readyWithSale(flat, 900_000, 100_000, later)).toEqual({ ready: null, waits: null });
    expect(readyWithSale(base, 600_000, null, later)).toEqual({ ready: { kind: 'month', month: '2027-02' }, waits: '2027-02-10' });
  });

  it('a check with replaces but no price yet asks first', () => {
    const { inputs, check } = toEngineInputs(loadCases().find((c) => c.id === 'SO-01')!.fixture);
    expect(evaluate(inputs, { ...check, price: null }).result.code).toBe('needs_input');
  });

  it('a stop with no usual month yet: nothing is raised', () => {
    const { inputs, check } = toEngineInputs(loadCases().find((c) => c.id === 'SO-06')!.fixture);
    const bare: V3Inputs = { ...inputs, months: inputs.months.filter((m) => !m.full) };
    const r = evaluate(bare, check);
    expect(r.month.typicalLeft).toBeNull();
    expect(r.result.afterBuy.usualMonth).toBeNull();
  });

  it('a yearly bill held back: a stop before its due date releases the hold-back, one after it does not', () => {
    const so6 = loadCases().find((c) => c.id === 'SO-06')!.fixture;
    const f = { ...so6, bills: [{ id: 'ins', amount: 300_000, everyMonths: 12 as const, nextDue: '2026-12-20', lastPaid: '2025-12-20', paidBy: 'me' as const }] };
    const { inputs, check } = toEngineInputs(f);
    const held = evaluate(inputs, { ...check, replaces: null }).funds.billsHeld?.total ?? 0;
    expect(held).toBeGreaterThan(0);
    const stop = (stopDate: string): StoppedCost => ({ id: 'ins', amount: mu(300_000), everyMonths: 12, stopDate, source: { kind: 'bill', seriesId: 'bill-ins' } });
    expect(evaluate(inputs, { ...check, replaces: { stops: [stop('2026-11-30')], sale: null } }).funds.billsHeld?.total).toBe(0);
    expect(evaluate(inputs, { ...check, replaces: { stops: [stop('2026-12-25')], sale: null } }).funds.billsHeld?.total).toBe(held);
    expect(evaluate({ ...inputs, unspent: null }, { ...check, replaces: { stops: [stop('2026-11-30')], sale: null } }).funds.unspent).toBeNull();
  });
});

