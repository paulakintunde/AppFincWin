/** 05.4-20 (FIN-04, FIN-10, FIN-14; D-08, D-39b, D-43): debts.ts, worked by hand. */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import {
  cardInstead,
  costlyDebt,
  costlyFacts,
  debtFacts,
  debtLinks,
  debtOutflows,
  debtsInMonth,
  debtsNotRecorded,
  dueDayFacts,
  isCostly,
  monthlyInterest,
} from '../debts';
import type { V3Account, V3Debt } from '../types';
import { v3Line, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const debt = (over: Partial<V3Debt> = {}): V3Debt => ({
  id: 'd1',
  kind: 'card',
  balance: mu(600_000),
  minimum: mu(15_000),
  apr: percent('24.9'),
  secured: false,
  isHousing: false,
  ...over,
});
const monthly = (id: string, role: 'bill' | 'debt_payment', amount: number, status: 'live' | 'ended' = 'live') =>
  v3Series({ id, role, cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount, ...(status === 'ended' ? { status, endDate: '2026-05-05' } : {}) });
const asOf = '2026-11-15';

describe('debtLinks and debtsInMonth: counted once (DB-03, DB-07)', () => {
  it('links its own series, else a debt-payment series with its id, else one of the same monthly amount; each series once', () => {
    const series = [monthly('bill-card', 'bill', 15_000), monthly('d2', 'debt_payment', 99_999), monthly('pay-x', 'debt_payment', 20_000), monthly('pay-y', 'debt_payment', 20_000)];
    const debts = [debt({ id: 'd1', seriesId: 'bill-card' }), debt({ id: 'd2', minimum: mu(5_000) }), debt({ id: 'd3', minimum: mu(20_000) }), debt({ id: 'd4', minimum: mu(20_000) }), debt({ id: 'd5', minimum: mu(20_000) })];
    const links = debtLinks(debts, series, asOf);
    expect([...links.entries()].map(([d, s]) => [d, s.id]).sort()).toEqual([
      ['d1', 'bill-card'],
      ['d2', 'd2'],
      ['d3', 'pay-x'],
      ['d4', 'pay-y'],
    ]);
    // d1 is paid through a bill: not set aside again; d2..d4 through debt-payment series stay; d5 is not linked
    expect(debtsInMonth(debts, series, asOf).map((d) => d.id)).toEqual(['d2', 'd3', 'd4', 'd5']);
  });

  it('an ended series, a series another debt took, or a series that is not a bill or debt payment pays nothing', () => {
    const series = [monthly('old', 'bill', 15_000, 'ended'), monthly('b', 'bill', 15_000), v3Series({ id: 'sv', role: 'saving', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: 15_000 })];
    const debts = [debt({ id: 'a', seriesId: 'b' }), debt({ id: 'z', seriesId: 'b' }), debt({ id: 'm', seriesId: 'old' }), debt({ id: 'n', seriesId: 'sv' })];
    expect([...debtLinks(debts, series, asOf).keys()]).toEqual(['a']);
  });
});

describe('debtOutflows: each minimum on its due date (FIN-04)', () => {
  const inputs = (debts: V3Debt[], series = [] as ReturnType<typeof monthly>[]) => ({ asOf, debts, series });

  it('DB-01: due on the 25th each month inside the 90 days; a due day past this month is taken as paid', () => {
    expect(debtOutflows(inputs([debt({ dueDay: 25, minimum: mu(30_000) })]), [], 90).flows.map((f) => [f.date, f.amount])).toEqual([
      ['2026-11-25', 30_000],
      ['2026-12-25', 30_000],
      ['2027-01-25', 30_000],
    ]);
    expect(debtOutflows(inputs([debt({ dueDay: 5 })]), [], 90).flows.map((f) => f.date)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);
  });

  it('DB-02: no due day (or one that is not a day of the month) is tomorrow, then the same day each month, and is stated', () => {
    for (const dueDay of [null, undefined, 0, 32, 2.5]) {
      const out = debtOutflows(inputs([debt({ dueDay, minimum: mu(30_000) })]), [], 90);
      expect(out.flows.map((f) => f.date)).toEqual(['2026-11-16', '2026-12-16', '2027-01-16']);
      expect(out.assumed).toEqual([{ debtId: 'd1', amount: 30_000 }]);
    }
    expect(dueDayFacts([{ debtId: 'd1', amount: mu(30_000) }])).toEqual([{ code: 'debt_due_day_assumed', values: { debtId: 'd1', amount: 30_000 } }]);
  });

  it('two minimums on one day land in debt order', () => {
    const out = debtOutflows(inputs([debt({ id: 'z', dueDay: 20 }), debt({ id: 'a', dueDay: 20 }), debt({ id: 'm', dueDay: 18 })]), [], 10).flows;
    expect(out.map((f) => [f.date, f.debtId])).toEqual([
      ['2026-11-18', 'm'],
      ['2026-11-20', 'a'],
      ['2026-11-20', 'z'],
    ]);
  });

  it('a due day past the month length falls on its last day (31 -> 30 November, 28 February)', () => {
    expect(debtOutflows(inputs([debt({ dueDay: 31 })]), [], 120).flows.map((f) => f.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });

  it('DB-10: only the part not yet paid lands this month; paid in full or more lands nothing this month', () => {
    const part = debtOutflows(inputs([debt({ dueDay: 25, minimum: mu(30_000), paidThisMonth: mu(10_000) })]), [], 45).flows;
    expect(part.map((f) => [f.date, f.amount])).toEqual([
      ['2026-11-25', 20_000],
      ['2026-12-25', 30_000],
    ]);
    const all = debtOutflows(inputs([debt({ dueDay: 25, minimum: mu(30_000), paidThisMonth: mu(40_000) })]), [], 45).flows;
    expect(all.map((f) => f.date)).toEqual(['2026-12-25']);
  });

  it('an unlinked paid debt-payment line of exactly the minimum this month pays it; each line pays one debt', () => {
    const line = v3Line({ id: 'l1', date: '2026-11-03', amount: 15_000, role: 'debt_payment', seriesId: null });
    const other = v3Line({ id: 'l2', date: '2026-11-03', amount: 15_001, role: 'debt_payment', seriesId: null });
    const out = debtOutflows(inputs([debt({ id: 'a', dueDay: 20 }), debt({ id: 'b', dueDay: 20 })]), [line, other], 30).flows;
    expect(out.map((f) => [f.debtId, f.date])).toEqual([['b', '2026-11-20']]);
  });

  it('a debt paid through a series, or with no minimum, lands nothing itself; tomorrow in a new month is a whole minimum', () => {
    const series = [monthly('d1', 'debt_payment', 15_000)];
    expect(debtOutflows(inputs([debt()], series), [], 90).flows).toEqual([]);
    expect(debtOutflows(inputs([debt({ minimum: mu(0) })]), [], 90).flows).toEqual([]);
    const end = debtOutflows({ asOf: '2026-11-30', debts: [debt({ paidThisMonth: mu(15_000) })], series: [] }, [], 40);
    expect(end.flows.map((f) => [f.date, f.amount])).toEqual([
      ['2026-12-01', 15_000],
      ['2027-01-01', 15_000],
    ]);
    expect(end.assumed).toEqual([{ debtId: 'd1', amount: 15_000 }]);
  });
});

describe('interest, the costly-debt caution and the fact lines (D-08, D-39b)', () => {
  it('DB-04 by hand: £6,000 x 24.9% / 12 = £124.50 a month; £1,800 toward the card cuts it by £37.35', () => {
    expect(monthlyInterest(debt())).toBe(12_450);
    expect(cardInstead(debt(), mu(180_000))).toEqual({ code: 'card_instead', values: { price: 180_000, saved: 3_735 } });
    // a price above the balance puts only the balance toward it
    expect(cardInstead(debt({ balance: mu(100_000) }), mu(180_000))).toEqual({ code: 'card_instead', values: { price: 100_000, saved: 2_075 } });
    expect(costlyFacts(debt(), mu(180_000)).map((f) => f.code)).toEqual(['debt_interest_cost', 'card_instead']);
  });

  it('no rate, a 0% rate or nothing owed costs nothing; a loan has no card line; a saving that rounds to 0 is not stated', () => {
    expect(monthlyInterest(debt({ apr: null }))).toBe(0);
    expect(monthlyInterest(debt({ apr: percent('0') }))).toBe(0);
    expect(monthlyInterest(debt({ balance: mu(0) }))).toBe(0);
    expect(cardInstead(debt({ kind: 'loan' }), mu(180_000))).toBeNull();
    expect(cardInstead(debt(), mu(1))).toBeNull();
    expect(costlyFacts(debt({ kind: 'loan' }), mu(180_000)).map((f) => f.code)).toEqual(['debt_interest_cost']);
  });

  it('20% APR is the line (D-07); costly needs money from earlier months and a balance; the largest interest is named', () => {
    expect(isCostly(debt({ apr: percent('20') }))).toBe(true);
    expect(isCostly(debt({ apr: percent('19.99') }))).toBe(false);
    expect(isCostly(debt({ apr: null }))).toBe(false);
    const small = debt({ id: 'small', balance: mu(9) });
    const big = debt({ id: 'big', balance: mu(900_000), apr: percent('29.9') });
    expect(costlyDebt([small, big, debt({ id: 'cheap', apr: percent('5') })], 1)?.id).toBe('big');
    expect(costlyDebt([small], 1)?.id).toBe('small'); // any balance left counts, however small its interest rounds
    expect(costlyDebt([big], 0)).toBeNull();
    expect(costlyDebt([debt({ balance: mu(0) })], 1)).toBeNull();
    expect(costlyDebt([debt({ id: 'b' }), debt({ id: 'a' })], 1)?.id).toBe('a'); // ties by id
    expect(costlyDebt([debt({ id: 'a', kind: 'loan' }), debt({ id: 'a' })], 1)?.kind).toBe('loan'); // the same id twice keeps the order given
  });

  it('fact lines: none when switched off; up to 2 interest lines then "and N more"; the stated costly debt is not repeated', () => {
    const debts = [debt({ id: 'a', balance: mu(100_000) }), debt({ id: 'b', balance: mu(300_000) }), debt({ id: 'c', balance: mu(200_000) }), debt({ id: 'none', apr: null })];
    expect(debtFacts(debts, mu(400_000), false, null)).toEqual([]);
    expect(debtFacts(debts, mu(400_000), true, null).map((f) => [f.code, f.values['balance'] ?? f.values['count']])).toEqual([
      ['debt_interest_cost', 300_000],
      ['debt_interest_cost', 200_000],
      ['debt_more', 1],
    ]);
    expect(debtFacts(debts, mu(400_000), true, 'b').map((f) => f.code)).toEqual(['debt_interest_cost', 'debt_more']);
  });

  it('DB-07 / DB-12 housing: $1,500 of $4,000 is 38% (37.5, half up), of $5,000 30%; none with no pay; joint once (FIN-14)', () => {
    const home = debt({ id: 'home', kind: 'loan', minimum: mu(150_000), apr: null, isHousing: true });
    expect(debtFacts([home], mu(400_000), true, null)).toEqual([{ code: 'housing_cost', values: { amount: 150_000, pay: 400_000, share: 38 } }]);
    expect(debtFacts([home], mu(500_000), true, null)[0]?.values['share']).toBe(30);
    expect(debtFacts([home], mu(0), true, null)).toEqual([]);
    expect(debtFacts([{ ...home, minimum: mu(-5) }], mu(400_000), true, null)).toEqual([]);
    const joint = debtFacts([debt({ apr: null, joint: true }), debt({ id: 'd2', apr: null, joint: true })], mu(400_000), true, null);
    expect(joint).toEqual([{ code: 'joint_loan_risk', values: {} }]);
  });
});

describe('debtsNotRecorded (D-43, QE-01, QE-13)', () => {
  const current = (limit: number | null | undefined): V3Account => ({ id: 'a1', balance: mu(1), use: { kind: 'everyday' }, kind: 'current', ...(limit === undefined ? {} : { overdraftLimit: limit === null ? null : mu(limit) }) });
  it('names what is missing in a fixed order, or all of it; nothing when all is recorded', () => {
    expect(debtsNotRecorded({ debts: [], accounts: [current(null)] })).toBe('all');
    expect(debtsNotRecorded({ debts: [debt()], accounts: [current(undefined)] })).toBe('loan_overdraft');
    expect(debtsNotRecorded({ debts: [debt({ kind: 'other' })], accounts: [current(0)] })).toBe('card');
    expect(debtsNotRecorded({ debts: [debt({ kind: 'loan' }), debt()], accounts: [current(50_000)] })).toBeNull();
    expect(debtsNotRecorded({ debts: [], accounts: [] })).toBe('loan_card');
    expect(debtsNotRecorded({ debts: [debt({ kind: 'loan' })] })).toBe('card');
    expect(debtsNotRecorded({ debts: [debt({ kind: 'loan' })], accounts: [{ ...current(null), kind: 'savings' }] })).toBe('card');
  });
});
