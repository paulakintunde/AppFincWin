/**
 * 05.4 FIN-05 / ENG-08 / D-48 (05.4-22): borrowing.ts by hand. The right-answer figures are pinned here (BR-02, BR-03, BR-04,
 * BR-15, DB-09: interest, the 20% and 10% lines, the home-loan skip).
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { SOLE_SHARE } from '../../share';
import { EXPENSIVE_APR_BP, EXPENSIVE_INTEREST_SHARE_BP } from '../constants';
import { borrowingFacts, cashFits, isExpensive, isExpensiveRate, planCost, saveVsBorrow, saveVsBorrowFact } from '../borrowing';
import type { Fact, Result, Schedule } from '../types';

const mu = minorUnits;

function sched(over: Partial<Schedule> = {}): Schedule {
  return {
    cadence: { unit: 'month', every: 1 },
    count: 6,
    payment: mu(10_592),
    finalPayment: mu(10_588),
    lastPaying: 6,
    firstDate: '2026-12-15',
    financed: mu(60_000),
    pauseInterest: mu(0),
    totalPaid: mu(63_548),
    totalInterest: mu(3_548),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    monthlyEquivalent: mu(10_592),
    source: 'computed',
    ...over,
  };
}

function cash(code: Result['code'], facts: Fact[] = [], readyBy: Result['readyBy'] = null): Result {
  return { code, readyBy, facts } as unknown as Result;
}

describe('borrowing: thresholds', () => {
  it('the constants are 20% APR and 10% of the amount borrowed (D-07)', () => {
    expect(EXPENSIVE_APR_BP).toBe(2000);
    expect(EXPENSIVE_INTEREST_SHARE_BP).toBe(1000);
  });

  it('20% or more is expensive; 19.99% is not; a quote past the largest rate is; an unknown rate is not', () => {
    expect(isExpensiveRate(percent('20'))).toBe(true); // BR-02: exactly 20%
    expect(isExpensiveRate(percent('19.99'))).toBe(false);
    expect(isExpensiveRate(percent('39.9'))).toBe(true); // BR-01
    expect(isExpensiveRate('above_max')).toBe(true);
    expect(isExpensiveRate(null)).toBe(false);
  });

  it('BR-02 at 20% is expensive on the rate alone ($35.48 is 5.91% of $600)', () => {
    expect(isExpensive(sched(), percent('20'), false)).toBe(true);
  });

  it('BR-03 at 19.9% with $35.31 (5.88%) is not', () => {
    expect(isExpensive(sched({ totalInterest: mu(3_531) }), percent('19.9'), false)).toBe(false);
  });

  it('BR-04: 7.9% but $1,282.14 on $6,000 (21.37%) is expensive by the 10% line; exactly 10% is too, just under is not', () => {
    expect(isExpensive(sched({ financed: mu(600_000), totalInterest: mu(128_214) }), percent('7.9'), false)).toBe(true);
    expect(isExpensive(sched({ financed: mu(600_000), totalInterest: mu(60_000) }), percent('7.9'), false)).toBe(true);
    expect(isExpensive(sched({ financed: mu(600_000), totalInterest: mu(59_999) }), percent('7.9'), false)).toBe(false);
  });

  it('BR-15: a home loan skips the 10% line (84.23% of $270,000 at 5.5%), but not the 20% line (D-39c)', () => {
    const home = sched({ financed: mu(27_000_000), totalInterest: mu(22_740_936) });
    expect(isExpensive(home, percent('5.5'), true)).toBe(false);
    expect(isExpensive(home, percent('5.5'), false)).toBe(true);
    expect(isExpensive(home, percent('20'), true)).toBe(true);
  });

  it('nothing borrowed is never expensive, whatever the rate', () => {
    expect(isExpensive(sched({ financed: mu(0), totalInterest: mu(0) }), percent('29.9'), false)).toBe(false);
  });

  it('cash fits only on the clean fit codes', () => {
    expect(['fits_month', 'fits_unspent'].map((c) => cashFits(c as Result['code']))).toEqual([true, true]);
    expect(['fits_uses_net', 'fits_uses_overdraft', 'not_yet', 'monthly_short', 'needs_input'].some((c) => cashFits(c as Result['code']))).toBe(false);
  });
});

describe('borrowing: the cost and the cash route', () => {
  it('planCost counts every fee: setup, per payment and at the end', () => {
    const s = sched({ fees: { setup: mu(1_000), perPeriod: mu(100), end: mu(500) } });
    expect(planCost(s)).toEqual({ interest: 3_548, fees: 2_100, totalPaid: 60_000 + 3_548 + 2_100, financed: 60_000 });
  });

  it('BR-02: cash fits, leaving the spare money after the price ($400); borrowing costs $35.48 more', () => {
    const v = saveVsBorrow(cash('fits_month', [{ code: 'month_left_after', values: { month: '2026-11', left: 40_000 } }, { code: 'unspent_before_after', values: { before: 100_000, after: 40_000 } }]), sched(), SOLE_SHARE);
    expect(v).toEqual({ cashCode: 'fits_month', readyBy: null, costsMore: 3_548, cashLeft: 40_000 });
    expect(saveVsBorrowFact(v)).toEqual({ code: 'save_vs_borrow', values: { kind: 'cash_fits', left: 40_000, more: 3_548 } });
  });

  it('D-75: the extra savings still above the net count in what cash leaves', () => {
    const facts: Fact[] = [
      { code: 'unspent_before_after', values: { before: 50_000, after: 0 } },
      { code: 'net_above_size', values: { above: 30_000 } },
      { code: 'extra_savings_used', values: { used: 10_000, above: 30_000 } },
    ];
    expect(saveVsBorrow(cash('fits_unspent', facts), sched(), SOLE_SHARE).cashLeft).toBe(20_000);
    expect(saveVsBorrow(cash('fits_unspent', facts.slice(0, 2)), sched(), SOLE_SHARE).cashLeft).toBe(30_000);
  });

  it('with no spare-money figure the month figure is what cash leaves', () => {
    const v = saveVsBorrow(cash('fits_month', [{ code: 'month_left_after', values: { month: '2026-11', left: 12_000 } }]), sched(), SOLE_SHARE);
    expect(v.cashLeft).toBe(12_000);
  });

  it('BR-01: cash Not yet, ready May 2027; borrowing costs £656.77 more', () => {
    const v = saveVsBorrow(cash('not_yet', [], { kind: 'month', month: '2027-05' }), sched({ totalInterest: mu(65_677) }), SOLE_SHARE);
    expect(saveVsBorrowFact(v)).toEqual({ code: 'save_vs_borrow', values: { kind: 'ready', readyBy: '2027-05', more: 65_677 } });
  });

  it('a payday ready date is a date', () => {
    const v = saveVsBorrow(cash('not_yet', [], { kind: 'date', date: '2026-12-01' }), sched(), SOLE_SHARE);
    expect(saveVsBorrowFact(v).values).toEqual({ kind: 'ready', readyBy: '2026-12-01', more: 3_548 });
  });

  it('a cash route that dips into the net or the overdraft says so, whatever its wait line (the purpose never changes it, I-D41)', () => {
    const net = saveVsBorrow(cash('fits_uses_net', [{ code: 'wait_keeps_net', values: { date: '2026-12-01' } }]), sched(), SOLE_SHARE);
    expect(net).toEqual({ cashCode: 'fits_uses_net', readyBy: null, costsMore: 3_548, cashLeft: null });
    expect(saveVsBorrowFact(net).values).toEqual({ kind: 'with_net', more: 3_548 });
    const need = saveVsBorrow(cash('fits_uses_net', [{ code: 'need_net_line', values: {} }]), sched(), SOLE_SHARE);
    expect(saveVsBorrowFact(need)).toEqual(saveVsBorrowFact(net));
    const od = saveVsBorrow(cash('fits_uses_overdraft', [{ code: 'wait_clears', values: { month: '2027-02', zero: 0 } }]), sched(), SOLE_SHARE);
    expect(saveVsBorrowFact(od).values).toEqual({ kind: 'with_overdraft', more: 3_548 });
  });

  it('a Not yet cash route with no date in sight, or one Short each month (a running cost), has no ready date', () => {
    expect(saveVsBorrowFact(saveVsBorrow(cash('not_yet', [], null), sched(), SOLE_SHARE)).values).toEqual({ kind: 'no_date', more: 3_548 });
    expect(saveVsBorrowFact(saveVsBorrow(cash('monthly_short', [], null), sched(), SOLE_SHARE)).values).toEqual({ kind: 'no_date', more: 3_548 });
  });

  it('a fit with no figure to read leaves cashLeft unset (no money is made up)', () => {
    expect(saveVsBorrow(cash('fits_month', []), sched(), SOLE_SHARE).cashLeft).toBeNull();
  });

  it('the cost more is the interest and the plan fees, my share once', () => {
    const half = { weights: [1, 1], myIndex: 0 };
    const s = sched({ totalInterest: mu(3_548), fees: { setup: mu(452), perPeriod: mu(0), end: mu(0) } });
    expect(saveVsBorrow(cash('not_yet', [], { kind: 'month', month: '2027-01' }), s, half).costsMore).toBe(2_000);
  });
});

describe('borrowing: the D-48 facts', () => {
  it('a plan with interest: the interest as a cost, the safety-net line and the income line', () => {
    expect(borrowingFacts(sched(), SOLE_SHARE, mu(63_548), false)).toEqual([
      { code: 'interest_is_a_cost', values: { interest: 3_548, total: 63_548 } },
      { code: 'net_covers_surprises', values: {} },
      { code: 'income_or_costs_first', values: {} },
    ]);
  });

  it('BR-14: a 0% plan gets only the two lines without interest', () => {
    expect(borrowingFacts(sched({ totalInterest: mu(0) }), SOLE_SHARE, mu(60_000), false).map((f) => f.code)).toEqual(['net_covers_surprises', 'income_or_costs_first']);
  });

  it('never a twin: interest already stated by the depletion lines is not stated again', () => {
    expect(borrowingFacts(sched(), SOLE_SHARE, mu(63_548), true).map((f) => f.code)).toEqual(['net_covers_surprises', 'income_or_costs_first']);
  });
});
