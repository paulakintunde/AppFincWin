/**
 * 05.4-61 (D-177 a): futures edges: the option order tables written out, error labels, the 600-month cap, the deposit rates
 * listed, the net-used flag, and the unspent-after fact read by its own code only.
 */
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent, ZERO_PERCENT } from '../../../../payoff/types';
import { SOLE_SHARE } from '../../../share';
import type { Funds, MonthModel, Purchase, Result, Schedule } from '../../types';
import { buyLater, cheaperOption, depositOfStream, insteadFutures, OPTION_ORDER, orderOptions } from '../futures';

const mu = minorUnits;
const ALL = ['buy_now', 'keep', 'deposit', 'buy_later', 'cheaper'] as const;

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    cadence: { unit: 'month', every: 1 },
    count: 24,
    payment: mu(8500),
    finalPayment: mu(8500),
    lastPaying: 24,
    firstDate: '2026-11-01',
    financed: mu(190000),
    pauseInterest: mu(0),
    totalPaid: mu(204000),
    totalInterest: mu(14000),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    monthlyEquivalent: mu(8500),
    source: 'computed',
    ...over,
  };
}

const month = { month: '2026-10', typicalLeft: mu(42500) } as unknown as MonthModel;
const funds = { unspent: { value: mu(240000) } } as unknown as Funds;
const resultOf = (facts: Result['facts']): Result => ({ code: 'fits_month', facts }) as unknown as Result;
const NOCHECK = { price: mu(300000), value: { cheaperPrice: null, useYears: null } };
const purchase = (over: Partial<Purchase> = {}): Purchase => ({ whole: mu(300000), dayOne: mu(300000), monthly: mu(0), schedule: null, share: SOLE_SHARE, purpose: null, ...over }) as unknown as Purchase;

describe('05.4-61 option order tables, written out', () => {
  it('a need lists the buy-now routes first', () => {
    expect([...OPTION_ORDER.need]).toEqual(['cheaper', 'buy_now', 'buy_later', 'keep', 'deposit']);
  });
  it('a want lists waiting and saving first', () => {
    expect([...OPTION_ORDER.want]).toEqual(['buy_later', 'keep', 'deposit', 'cheaper', 'buy_now']);
  });
  it('no purpose keeps today\'s order, the cheaper one last', () => {
    expect([...OPTION_ORDER.none]).toEqual(['buy_now', 'keep', 'deposit', 'buy_later', 'cheaper']);
    expect(orderOptions([...ALL], null)).toEqual(['buy_now', 'keep', 'deposit', 'buy_later', 'cheaper']);
  });
});

describe('05.4-61 cheaperOption overflow names itself', () => {
  it('a per-year figure past the safe range says cheaperOption', () => {
    expect(() => cheaperOption(Number.MAX_SAFE_INTEGER as MinorUnits, { cheaperPrice: mu(2), useYears: 0.01 })).toThrow('cheaperOption: result exceeds Number.MAX_SAFE_INTEGER');
  });
});

describe('05.4-61 depositOfStream overflow names itself', () => {
  it('a value past the safe range', () => {
    expect(() => depositOfStream({ schedule: schedule({ monthlyEquivalent: mu(10) }), lump: Number.MAX_SAFE_INTEGER as MinorUnits, rate: ZERO_PERCENT, months: 1 })).toThrow(
      'depositOfStream: result exceeds Number.MAX_SAFE_INTEGER',
    );
  });
  it('interest given up past the safe range', () => {
    expect(() =>
      depositOfStream({ schedule: schedule({ monthlyEquivalent: mu(0), totalInterest: Number.MAX_SAFE_INTEGER as MinorUnits }), lump: mu(100_000), rate: percent('5'), months: 12 }),
    ).toThrow('depositOfStream: result exceeds Number.MAX_SAFE_INTEGER');
  });
});

describe('05.4-61 buyLater at the 600-month cap', () => {
  const base = { price: mu(60_000), unspent: mu(0), typicalLeft: mu(100), month: '2026-10' };
  it('exactly 600 months is still a date', () => {
    const r = buyLater(base);
    expect(r.months).toBe(600);
    expect(r.readyBy).toBe('2076-10');
    expect(r.monthlyAmount).toBe(100);
  });
  it('601 months is past the cap: no date, the monthly amount stays', () => {
    expect(buyLater({ ...base, price: mu(60_001) })).toEqual({ months: null, readyBy: null, monthlyAmount: 100 });
  });
});

describe('05.4-61 insteadFutures', () => {
  it('the years of use are capped at 50 (600 months), never 7200', () => {
    const f = insteadFutures({ check: NOCHECK, result: resultOf([]), month, funds, purchase: purchase(), userRate: null, years: 1000 });
    expect(f.deposit.months).toBe(600);
    const small = insteadFutures({ check: NOCHECK, result: resultOf([]), month, funds, purchase: purchase(), userRate: null, years: 3 });
    expect(small.deposit.months).toBe(36);
  });

  it('a 0% rate is one view, a null rate is one view, and a rate of 5% adds a second', () => {
    const run = (userRate: ReturnType<typeof percent> | null) => insteadFutures({ check: NOCHECK, result: resultOf([]), month, funds, purchase: purchase(), userRate, years: 5 }).deposit.views.map((v) => v.rate);
    expect(run(ZERO_PERCENT)).toEqual([ZERO_PERCENT]);
    expect(run(null)).toEqual([ZERO_PERCENT]);
    expect(run(percent('5'))).toEqual([ZERO_PERCENT, percent('5')]);
  });

  it('emergency money is untouched unless a net_used fact says otherwise', () => {
    const none = insteadFutures({ check: NOCHECK, result: resultOf([{ code: 'month_left_after', values: {} }]), month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(none.buyNow.emergencyUntouched).toBe(true);
    const used = insteadFutures({ check: NOCHECK, result: resultOf([{ code: 'net_used', values: {} }]), month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(used.buyNow.emergencyUntouched).toBe(false);
    const both = insteadFutures({ check: NOCHECK, result: resultOf([{ code: 'month_left_after', values: {} }, { code: 'net_used', values: {} }]), month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(both.buyNow.emergencyUntouched).toBe(false);
  });

  it('the unspent after is read from the unspent_before_after fact only, not from any other fact that has an "after"', () => {
    const other = insteadFutures({ check: NOCHECK, result: resultOf([{ code: 'month_left_after', values: { after: 5 } }]), month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(other.buyNow.unspentAfter).toBe(240000 - 300000);
    const own = insteadFutures({ check: NOCHECK, result: resultOf([{ code: 'month_left_after', values: { after: 5 } }, { code: 'unspent_before_after', values: { after: 77 } }]), month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(own.buyNow.unspentAfter).toBe(77);
  });
});
