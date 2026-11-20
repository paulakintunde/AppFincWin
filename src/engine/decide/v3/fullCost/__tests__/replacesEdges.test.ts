/**
 * 05.4-61 (D-177 a): edge and order cases for replaces.ts that the SO cases did not pin: ties on the path end, caller's array
 * left alone, a second stop in a named category, other debts' payments, and the sort of the merged flows.
 */
import { minorUnits as mu } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type { DebtFlow } from '../../debts';
import { v3Series } from '../../__tests__/helpers/fixtures';
import type { Sale, StoppedCost, V3Debt } from '../../types';
import { replacesEffect, saleFlows, stopCounts, stoppedCostFlows, usualFreed, type ReplacesCtx } from '../replaces';

const ASOF = '2026-11-15';

const phone = v3Series({ id: 'bill-phone', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: mu(8000) });
const monthlyExcluded = v3Series({ id: 'bill-me', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: mu(8000), typicalChoice: 'excluded' });
const weeklyExcluded = v3Series({ id: 'bill-we', role: 'bill', cadence: { unit: 'week', every: 2 }, anchorDate: '2026-01-02', amount: mu(10_000), typicalChoice: 'excluded' });

const month: ReplacesCtx['month'] = { e: mu(80_000), categoryMonthly: [{ categoryId: 'gym', amount: mu(3_000) }] };

function ctx(over: Partial<ReplacesCtx> = {}): ReplacesCtx {
  return { asOf: ASOF, days: 90, series: [phone, monthlyExcluded, weeklyExcluded], paid: new Set(), debts: [], debtFlows: [], month, ...over };
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
const flow = (debtId: string, date: string, amount: number): DebtFlow => ({ debtId, date, amount: mu(amount) });

describe('05.4-61 stopCounts: the cadences that count', () => {
  it.each([
    [1, true],
    [3, true],
    [12, true],
    [2, false],
    [6, false],
    [0, false],
  ])('every %i months counts: %s', (everyMonths, counts) => {
    expect(stopCounts(billStop({ everyMonths: everyMonths as 1 }))).toBe(counts);
  });
});

describe('05.4-61 stoppedCostFlows', () => {
  it('leaves the caller\'s stops in the order they were given', () => {
    const stops = [dayStop({ id: 'b' }), dayStop({ id: 'a' })];
    stoppedCostFlows(stops, ctx());
    expect(stops.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('a month whose last day is the path end is not on the path', () => {
    // 46 days from 15 November is 31 December: the end is exclusive
    expect(stoppedCostFlows([dayStop()], ctx({ days: 46 }))).toEqual([]);
    expect(stoppedCostFlows([dayStop()], ctx({ days: 47 }))).toEqual([{ date: '2026-12-31', amount: 5000 }]);
  });

  it('bill dues and everyday shares come back in date order', () => {
    const out = stoppedCostFlows([billStop({ stopDate: '2026-10-01' }), dayStop()], ctx());
    expect(out.map((f) => f.date)).toEqual(['2026-12-01', '2026-12-31', '2027-01-01', '2027-01-31', '2027-02-01']);
  });

  it('a second stop in a named category gets what the first left of the category, not nothing', () => {
    const c = ctx({ month: { e: mu(80_000), categoryMonthly: [{ categoryId: 'rent', amount: mu(9_000) }, { categoryId: 'gym', amount: mu(3_000) }] } });
    const gym1 = dayStop({ id: 'g1', amount: mu(1000), source: { kind: 'everyday', categoryId: 'gym' } });
    const gym2 = dayStop({ id: 'g2', amount: mu(2500), source: { kind: 'everyday', categoryId: 'gym' } });
    const dec = stoppedCostFlows([gym1, gym2], c).filter((f) => f.date === '2026-12-31');
    expect(dec.map((f) => f.amount)).toEqual([1000, 2000]);
  });
});

describe('05.4-61 saleFlows', () => {
  it('a sale that arrives on the last day of the path (the end is exclusive) is off it, with or without a debt', () => {
    // 90 days from 15 November 2026 is 13 February 2027
    const noDebt = saleFlows(sale({ arrives: '2027-02-13' }), ctx());
    expect(noDebt.account).toBeNull();
    expect(noDebt.flows).toEqual([]);
    expect(saleFlows(sale({ arrives: '2027-02-12' }), ctx()).account).toEqual({ date: '2027-02-12', amount: 500_000 });
    const withDebt = saleFlows(sale({ arrives: '2027-02-13', paysDebtId: 'd', amount: mu(500_000) }), ctx({ debts: [debt({ balance: mu(100_000) })] }));
    expect(withDebt.toAccount).toBe(400_000);
    expect(withDebt.account).toBeNull();
    expect(withDebt.flows).toEqual([]);
  });

  it('a sale that names a recorded debt pays it', () => {
    const s = saleFlows(sale({ paysDebtId: 'd' }), ctx({ debts: [debt({ balance: mu(100_000) }), debt({ id: 'other', balance: mu(900_000) })] }));
    expect(s.debt).toEqual({ id: 'd', left: 0 });
    expect(s.toDebt).toBe(100_000);
    expect(saleFlows(sale({ paysDebtId: 'other' }), ctx({ debts: [debt({ balance: mu(100_000) }), debt({ id: 'other', balance: mu(900_000) })] })).debt).toEqual({ id: 'other', left: 400_000 });
  });

  it('only the named debt\'s own payments are ended by the sale, not another debt\'s', () => {
    const s = saleFlows(sale({ paysDebtId: 'd' }), ctx({
      debts: [debt({ balance: mu(100_000) }), debt({ id: 'other', balance: mu(900_000) })],
      debtFlows: [flow('d', '2026-12-05', 25_000), flow('other', '2026-12-05', 99_000)],
    }));
    expect(s.flows).toEqual([
      { date: '2026-11-20', amount: 400_000 },
      { date: '2026-12-05', amount: 25_000 },
    ]);
  });

  it('a payment that falls on the very day the sale arrives is not paid before it: it stays owed and is ended by the sale', () => {
    const s = saleFlows(sale({ paysDebtId: 'd', amount: mu(100_000), arrives: '2026-12-05' }), ctx({
      debts: [debt({ balance: mu(100_000) })],
      debtFlows: [flow('d', '2026-12-05', 25_000)],
    }));
    expect(s.toDebt).toBe(100_000);
    expect(s.debt).toEqual({ id: 'd', left: 0 });
    expect(s.flows).toEqual([{ date: '2026-12-05', amount: 25_000 }]);
  });

  it('a payment on the sale day with part of the loan left: owed is not reduced by it', () => {
    const s = saleFlows(sale({ paysDebtId: 'd', amount: mu(50_000), arrives: '2026-12-05' }), ctx({
      debts: [debt({ balance: mu(100_000) })],
      debtFlows: [flow('d', '2026-12-05', 25_000)],
    }));
    expect(s.debt).toEqual({ id: 'd', left: 50_000 });
  });
});

describe('05.4-61 usualFreed', () => {
  const none = saleFlows(null, ctx());

  it('a monthly bill still counts when its series was left out of the typical month only if it is a longer cadence', () => {
    expect(usualFreed({ stops: [billStop({ source: { kind: 'bill', seriesId: 'bill-me' } })], sale: null }, ctx(), none)).toBe(8000);
  });

  it('a weekly-cadence bill left out of the typical month still gives back its monthly equivalent', () => {
    expect(usualFreed({ stops: [billStop({ source: { kind: 'bill', seriesId: 'bill-we' } })], sale: null }, ctx(), none)).toBeGreaterThan(0);
  });

  it('a debt paid off by the sale gives back its minimum, and a negative minimum gives back 0', () => {
    const d1 = debt({ balance: mu(100_000), minimum: mu(25_000) });
    const s1 = saleFlows(sale({ paysDebtId: 'd', amount: mu(100_000) }), ctx({ debts: [d1] }));
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd', amount: mu(100_000) }) }, ctx({ debts: [d1] }), s1)).toBe(25_000);
    const d2 = debt({ balance: mu(100_000), minimum: mu(-500) });
    const s2 = saleFlows(sale({ paysDebtId: 'd', amount: mu(100_000) }), ctx({ debts: [d2] }));
    expect(usualFreed({ stops: [], sale: sale({ paysDebtId: 'd', amount: mu(100_000) }) }, ctx({ debts: [d2] }), s2)).toBe(0);
  });
});

describe('05.4-61 replacesEffect', () => {
  const BUY = '2026-11-25';

  it('a sale arriving by the purchase date is netted against day one, so it is not on the path as well', () => {
    const e = replacesEffect({ stops: [], sale: sale() }, ctx(), BUY)!;
    expect(e.saleNow).toBe(500_000);
    expect(e.flows).toEqual([]);
    expect(e.saleOnPath).toBeNull();
    expect(e.facts).toEqual([{ code: 'sale_counted', values: { amount: 500_000, date: '2026-11-20' } }]);
  });

  it('the debt payments the sale ends stay on the path even when its account part is netted', () => {
    const e = replacesEffect({ stops: [], sale: sale({ paysDebtId: 'd', amount: mu(150_000) }) }, ctx({ debts: [debt({ balance: mu(100_000) })], debtFlows: [flow('d', '2026-12-05', 25_000)] }), BUY)!;
    expect(e.saleNow).toBe(50_000);
    expect(e.flows).toEqual([{ date: '2026-12-05', amount: 25_000 }]);
  });

  it('a debt the sale pays off in full says nothing about a rest owed; one paid in part does', () => {
    const full = replacesEffect({ stops: [], sale: sale({ paysDebtId: 'd', amount: mu(100_000) }) }, ctx({ debts: [debt({ balance: mu(100_000) })] }), BUY)!;
    expect(full.facts.map((f) => f.code)).toEqual(['sale_counted']);
    expect(full.debts).toEqual([]);
    const part = replacesEffect({ stops: [], sale: sale({ paysDebtId: 'd', amount: mu(60_000) }) }, ctx({ debts: [debt({ balance: mu(100_000) })] }), BUY)!;
    expect(part.facts.map((f) => f.code)).toEqual(['sale_counted', 'debt_left_after_sale']);
    expect(part.facts[1]).toEqual({ code: 'debt_left_after_sale', values: { amount: 40_000 } });
  });

  it('the sale\'s flows and the stops\' flows come back in date order', () => {
    // the sale arrives after the purchase date, so its account part is on the path, later than the first stopped-bill dues
    const e = replacesEffect({ stops: [billStop({ stopDate: '2026-10-01' })], sale: sale({ arrives: '2027-01-15' }) }, ctx(), '2026-11-15')!;
    expect(e.flows.map((f) => f.date)).toEqual(['2026-12-01', '2027-01-01', '2027-01-15', '2027-02-01']);
  });
});
